import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!thread) return new Response('Not found', { status: 404 });

  const { data: messages } = await supabaseAdmin
    .from('chat_messages')
    .select('id, role, content, model, tokens_used, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true });

  return Response.json({ thread, messages: messages ?? [] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { title } = await req.json();
  const { error } = await supabaseAdmin
    .from('chat_threads')
    .update({ title })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('chat_threads')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
