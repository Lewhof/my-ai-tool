import { supabaseAdmin } from '@/lib/supabase-server';

// One-time migration: add type + excalidraw_scene columns to diagrams.
// Call: POST /api/migrate/diagrams-excalidraw
// Idempotent — safe to hit multiple times.
export async function POST() {
  const sql = `ALTER TABLE public.diagrams
       ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'flow'
       CHECK (type IN ('flow', 'excalidraw'));
     ALTER TABLE public.diagrams
       ADD COLUMN IF NOT EXISTS excalidraw_scene JSONB;`;

  // Preferred: hit the Supabase Management API directly with the PAT.
  const pat = process.env.SUPABASE_PAT;
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];

  if (pat && projectRef) {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      },
    );
    if (res.ok) return Response.json({ ok: true, via: 'management-api' });
    const errText = await res.text();
    // Fallthrough to column-existence check before surfacing the error.
    const { error: testErr } = await supabaseAdmin
      .from('diagrams')
      .select('type, excalidraw_scene')
      .limit(1);
    if (!testErr) return Response.json({ ok: true, message: 'Columns already exist' });
    return Response.json({ error: `Management API failed: ${errText}`, sql }, { status: 500 });
  }

  // Fallback: test whether the columns already exist.
  const { error: testErr } = await supabaseAdmin
    .from('diagrams')
    .select('type, excalidraw_scene')
    .limit(1);
  if (!testErr) return Response.json({ ok: true, message: 'Columns already exist' });

  return Response.json({
    error: 'No SUPABASE_PAT set and columns do not exist. Run this SQL in Supabase dashboard:',
    sql,
  }, { status: 500 });
}
