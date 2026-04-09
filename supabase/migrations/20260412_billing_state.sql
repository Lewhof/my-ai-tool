-- Manual Anthropic balance tracking.
-- Anthropic's public API does not expose remaining credit balance, so users
-- record their current balance here after a top-up. The UI computes
-- remaining = starting_balance − (Helicone spend since set_at).

CREATE TABLE IF NOT EXISTS public.billing_state (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT NOT NULL,
  provider              TEXT NOT NULL DEFAULT 'anthropic' CHECK (provider IN ('anthropic')),
  starting_balance_usd  NUMERIC(10,4) NOT NULL,
  set_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  alert_threshold_usd   NUMERIC(10,4) NOT NULL DEFAULT 5.0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_state_user_provider
  ON public.billing_state(user_id, provider);

ALTER TABLE public.billing_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own billing state" ON public.billing_state;
CREATE POLICY "Users manage their own billing state" ON public.billing_state
  FOR ALL USING (auth.jwt() ->> 'sub' = user_id);
