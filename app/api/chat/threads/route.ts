import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('chat_threads')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ threads: data });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { title } = await req.json().catch(() => ({ title: 'New Chat' }));

  const { data, error } = await supabaseAdmin
    .from('chat_threads')
    .insert({ user_id: userId, title: title || 'New Chat' })
    .select('id, title')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
