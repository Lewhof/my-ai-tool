-- Sprint B3: Mind Library search — full-text vector on highlights for philosophy search.

ALTER TABLE public.highlights
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- Backfill any existing rows (there may be zero, which is fine).
UPDATE public.highlights
SET search_vector =
       setweight(to_tsvector('english', coalesce(content, '')), 'A')
    || setweight(to_tsvector('english', coalesce(source_title, '')), 'B')
    || setweight(to_tsvector('english', array_to_string(coalesce(tags, '{}'), ' ')), 'C')
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_highlights_search_vector
  ON public.highlights USING gin(search_vector);

-- Auto-maintain the vector on insert/update.
CREATE OR REPLACE FUNCTION public.highlights_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
       setweight(to_tsvector('english', coalesce(NEW.content, '')), 'A')
    || setweight(to_tsvector('english', coalesce(NEW.source_title, '')), 'B')
    || setweight(to_tsvector('english', array_to_string(coalesce(NEW.tags, '{}'), ' ')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_highlights_search_vector ON public.highlights;
CREATE TRIGGER trg_highlights_search_vector
  BEFORE INSERT OR UPDATE ON public.highlights
  FOR EACH ROW EXECUTE FUNCTION public.highlights_search_vector_update();

-- Ranked full-text search RPC used by /api/mind/search.
-- Takes a plainto-style tsquery string and returns top matches ordered by rank.
CREATE OR REPLACE FUNCTION public.highlights_search(
  p_user_id TEXT,
  p_query TEXT,
  p_limit INT DEFAULT 8
) RETURNS TABLE (
  id UUID,
  content TEXT,
  source_type TEXT,
  source_id UUID,
  source_title TEXT,
  tags TEXT[],
  rank REAL
) LANGUAGE sql STABLE AS $$
  SELECT
    h.id, h.content, h.source_type, h.source_id, h.source_title, h.tags,
    ts_rank(h.search_vector, to_tsquery('english', p_query)) AS rank
  FROM public.highlights h
  WHERE h.user_id = p_user_id
    AND h.search_vector @@ to_tsquery('english', p_query)
  ORDER BY rank DESC, h.created_at DESC
  LIMIT p_limit;
$$;
