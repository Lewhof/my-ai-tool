import { supabaseAdmin } from '@/lib/supabase-server';

// One-time migration: add share_token column to diagrams
// Call: POST /api/migrate/share-token
export async function POST() {
  const { error } = await supabaseAdmin.rpc('exec_sql', {
    sql: 'ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS share_token text UNIQUE',
  });

  // If rpc doesn't exist, try raw approach — just test if column works
  if (error) {
    // Test if column already exists by trying a select
    const { error: testErr } = await supabaseAdmin
      .from('diagrams')
      .select('share_token')
      .limit(1);

    if (testErr) {
      return Response.json({
        error: 'Column does not exist. Run this SQL in Supabase dashboard:',
        sql: 'ALTER TABLE diagrams ADD COLUMN share_token text UNIQUE;',
      }, { status: 500 });
    }
    return Response.json({ ok: true, message: 'Column already exists' });
  }

  return Response.json({ ok: true });
}
