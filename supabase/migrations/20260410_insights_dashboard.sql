-- Sprint B2 Insights Dashboard — wellness metrics + analytics sites
-- See /wellness and /settings/analytics

-- ── Wellness metrics: biometrics & workouts from Garmin/Apple Health/manual ──
CREATE TABLE IF NOT EXISTS public.wellness_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  source TEXT NOT NULL,           -- 'garmin' | 'apple_health' | 'manual' | 'demo'
  metric TEXT NOT NULL,           -- 'steps' | 'sleep_hours' | 'resting_hr' | 'body_battery' | 'stress' | 'weight' | 'workout'
  value NUMERIC,
  unit TEXT,
  raw_jsonb JSONB,                -- full payload for activities/workouts
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, source, metric)
);

CREATE INDEX IF NOT EXISTS idx_wellness_user_date ON public.wellness_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_wellness_metric ON public.wellness_metrics(user_id, metric, date DESC);

ALTER TABLE public.wellness_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_wellness_metrics ON public.wellness_metrics FOR ALL USING (true);

-- ── Analytics sites: multi-site registry for web analytics providers ──
CREATE TABLE IF NOT EXISTS public.analytics_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  provider TEXT NOT NULL,         -- 'plausible' | 'vercel' | 'ga4' | 'umami' | 'manual'
  provider_site_id TEXT,          -- Plausible domain, Vercel project slug, GA4 property, etc.
  api_key_vault_ref TEXT,         -- reference into vault table, never store raw key here
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_sites_user ON public.analytics_sites(user_id, is_active);

ALTER TABLE public.analytics_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_analytics_sites ON public.analytics_sites FOR ALL USING (true);
