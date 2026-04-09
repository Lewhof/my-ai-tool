-- Sprint B4: Bank Statement Analyzer — dedup + source tracking on finance_entries
-- Allows importing statements repeatedly without double-counting transactions.

ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS import_hash TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Backfill: everything existing is 'manual', no hash.
UPDATE public.finance_entries SET source = 'manual' WHERE source IS NULL;

-- Partial unique index: only dedup rows that were imported (have a hash).
-- Existing NULL hashes never conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_import_hash
  ON public.finance_entries(user_id, import_hash)
  WHERE import_hash IS NOT NULL;

-- Filter by source (all manual / all from statements / etc.)
CREATE INDEX IF NOT EXISTS idx_finance_entries_source
  ON public.finance_entries(user_id, source);
