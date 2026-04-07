import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { fireEvent } from '@/lib/agent/event-triggers';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('whiteboard')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ items: data });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { title, description, status, priority, tags } = await req.json();
  if (!title?.trim()) return Response.json({ error: 'Title required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('whiteboard')
    .insert({
      user_id: userId,
      title,
      description: description || null,
      status: status || 'idea',
      priority: priority ?? 99,
      tags: tags || [],
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  after(async () => {
    await fireEvent('whiteboard.created', userId, { title, description: description || '', id: data.id });
  });

  return Response.json(data);
}
