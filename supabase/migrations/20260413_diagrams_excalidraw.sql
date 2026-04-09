-- Add Excalidraw engine option to the diagrams table.
-- Existing rows default to 'flow' (React Flow editor) so nothing breaks.
-- Excalidraw scenes live in their own JSONB column because the shape
-- is very different from React Flow nodes/edges.

ALTER TABLE public.diagrams
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'flow'
    CHECK (type IN ('flow', 'excalidraw'));

ALTER TABLE public.diagrams
  ADD COLUMN IF NOT EXISTS excalidraw_scene JSONB;
