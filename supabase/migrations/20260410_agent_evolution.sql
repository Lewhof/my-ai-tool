-- Sprint B7: Agent Evolution — Cerebro self-improvement primitives.
--
-- Three tables:
--   cerebro_rules            — user-editable behavior rules injected into the system prompt
--   cerebro_tool_metrics     — per-tool call telemetry (latency, success, errors)
--   cerebro_message_feedback — thumbs up/down + correction text per assistant message

-- ── cerebro_rules ──
CREATE TABLE IF NOT EXISTS public.cerebro_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  rule       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'prefer' CHECK (category IN ('do', 'dont', 'prefer')),
  source     TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'reflection', 'feedback', 'self')),
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  hits       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cerebro_rules_user_active
  ON public.cerebro_rules(user_id, active);

ALTER TABLE public.cerebro_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own rules" ON public.cerebro_rules;
CREATE POLICY "Users manage their own rules" ON public.cerebro_rules
  FOR ALL USING (auth.jwt() ->> 'sub' = user_id);

-- ── cerebro_tool_metrics ──
CREATE TABLE IF NOT EXISTS public.cerebro_tool_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  tool_name     TEXT NOT NULL,
  duration_ms   INT NOT NULL,
  success       BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  called_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cerebro_tool_metrics_user_time
  ON public.cerebro_tool_metrics(user_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_cerebro_tool_metrics_tool
  ON public.cerebro_tool_metrics(user_id, tool_name, called_at DESC);

ALTER TABLE public.cerebro_tool_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view their own metrics" ON public.cerebro_tool_metrics;
CREATE POLICY "Users view their own metrics" ON public.cerebro_tool_metrics
  FOR ALL USING (auth.jwt() ->> 'sub' = user_id);

-- ── cerebro_message_feedback ──
CREATE TABLE IF NOT EXISTS public.cerebro_message_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID NOT NULL,
  user_id         TEXT NOT NULL,
  rating          TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  correction_text TEXT,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cerebro_feedback_message
  ON public.cerebro_message_feedback(message_id);

CREATE INDEX IF NOT EXISTS idx_cerebro_feedback_user_unresolved
  ON public.cerebro_message_feedback(user_id, resolved, created_at DESC);

ALTER TABLE public.cerebro_message_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own feedback" ON public.cerebro_message_feedback;
CREATE POLICY "Users manage their own feedback" ON public.cerebro_message_feedback
  FOR ALL USING (auth.jwt() ->> 'sub' = user_id);

-- Retention note: cerebro_tool_metrics rows older than 90 days should be purged
-- by a cron job. For now this is manual / on-demand via a cleanup SQL call.
