import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// List persisted generated images for the current user.
// Signed URLs are regenerated on every request so the 1-year expiry is moot.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '60', 10) || 60, 200);
  const source = searchParams.get('source'); // optional: 'cerebro' | 'image_lab'

  let query = supabaseAdmin
    .from('generated_images')
    .select('id, prompt, storage_path, provider, source, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (source === 'cerebro' || source === 'image_lab') {
    query = query.eq('source', source);
  }

  const { data: rows, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Batch-sign all paths in parallel
  const images = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: signed } = await supabaseAdmin.storage
        .from('notes')
        .createSignedUrl(row.storage_path, 3600); // 1h — cheap to regenerate
      return {
        id: row.id,
        prompt: row.prompt,
        provider: row.provider,
        source: row.source,
        created_at: row.created_at,
        url: signed?.signedUrl ?? null,
      };
    })
  );

  return Response.json({ images });
}

// Delete a generated image — removes the Storage blob and the DB row.
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  // Load row to get storage path and verify ownership
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from('generated_images')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !row) return Response.json({ error: 'Not found' }, { status: 404 });

  // Remove from Storage first, then DB row. Ignore Storage errors so a missing
  // blob can still be cleaned up from the table.
  await supabaseAdmin.storage.from('notes').remove([row.storage_path]);

  const { error: delErr } = await supabaseAdmin
    .from('generated_images')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  return Response.json({ ok: true });
}
