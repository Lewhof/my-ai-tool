import { supabaseAdmin } from '@/lib/supabase-server';

// One-time migration: add type + excalidraw_scene columns to diagrams.
// Call: POST /api/migrate/diagrams-excalidraw
// Idempotent — safe to hit multiple times.
export async function POST() {
  const statements = [
    `ALTER TABLE public.diagrams
       ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'flow'
       CHECK (type IN ('flow', 'excalidraw'))`,
    `ALTER TABLE public.diagrams
       ADD COLUMN IF NOT EXISTS excalidraw_scene JSONB`,
  ];

  for (const sql of statements) {
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql });
    if (error) {
      // Fallback: test if the end state already exists by selecting the column.
      const { error: testErr } = await supabaseAdmin
        .from('diagrams')
        .select('type, excalidraw_scene')
        .limit(1);
      if (testErr) {
        return Response.json({
          error: 'Columns do not exist. Run this SQL in Supabase dashboard:',
          sql: statements.join(';\n'),
        }, { status: 500 });
      }
      return Response.json({ ok: true, message: 'Columns already exist' });
    }
  }

  return Response.json({ ok: true });
}
