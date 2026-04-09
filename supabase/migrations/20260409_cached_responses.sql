-- Phase 4.2 Tier 1: Exact-match response caching for stateless AI classifications
-- See lib/ai-cache.ts for usage rules.

CREATE TABLE IF NOT EXISTS public.cached_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,      -- SHA-256 hash of normalized input
  scope TEXT NOT NULL,                  -- 'search.expand' | 'quick-capture' | 'clip.classify'
  response JSONB NOT NULL,              -- cached AI response
  hit_count INTEGER DEFAULT 0,          -- telemetry
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL       -- explicit expiry (no reliance on TTL)
);

CREATE INDEX IF NOT EXISTS idx_cached_responses_key ON public.cached_responses(cache_key);
CREATE INDEX IF NOT EXISTS idx_cached_responses_scope_created ON public.cached_responses(scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cached_responses_expires ON public.cached_responses(expires_at);

ALTER TABLE public.cached_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_cached_responses ON public.cached_responses FOR ALL USING (true);
