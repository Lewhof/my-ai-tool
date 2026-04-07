import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('document_folders')
    .select('id, name, parent_id, color, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Count docs per folder
  const { data: docs } = await supabaseAdmin
    .from('documents')
    .select('folder_id')
    .eq('user_id', userId);

  const counts: Record<string, number> = {};
  for (const doc of docs ?? []) {
    if (doc.folder_id) counts[doc.folder_id] = (counts[doc.folder_id] ?? 0) + 1;
  }

  const folders = (data ?? []).map((f) => ({ ...f, doc_count: counts[f.id] ?? 0 }));
  return Response.json({ folders });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { name, parent_id, color } = await req.json();
  if (!name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('document_folders')
    .insert({
      user_id: userId,
      name,
      parent_id: parent_id || null,
      color: color || '#64748b',
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: 'ID required' }, { status: 400 });

  // Move docs in this folder to unfiled
  await supabaseAdmin
    .from('documents')
    .update({ folder_id: null })
    .eq('folder_id', id)
    .eq('user_id', userId);

  const { error } = await supabaseAdmin
    .from('document_folders')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
