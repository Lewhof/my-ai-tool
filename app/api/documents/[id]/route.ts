import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!doc) return new Response('Not found', { status: 404 });

  const { data: signedUrl } = await supabaseAdmin.storage
    .from('documents')
    .createSignedUrl(doc.file_path, 3600);

  return Response.json({ ...doc, signed_url: signedUrl?.signedUrl ?? null });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.folder_id !== undefined) updates.folder_id = body.folder_id || null;
  if (body.folder !== undefined) updates.folder = body.folder;
  if (body.name !== undefined) updates.name = body.name;
  if (body.display_name !== undefined) updates.display_name = body.display_name || null;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No updates provided' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('documents')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('file_path')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!doc) return new Response('Not found', { status: 404 });

  await supabaseAdmin.storage.from('documents').remove([doc.file_path]);
  await supabaseAdmin.from('documents').delete().eq('id', id);

  return Response.json({ ok: true });
}
