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
