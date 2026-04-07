import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ todos: data });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { title, description, status, priority, due_date, bucket, tags, recurrence } = await req.json();
  if (!title?.trim()) return Response.json({ error: 'Title required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('todos')
    .insert({
      user_id: userId,
      title,
      description: description || null,
      status: status || 'todo',
      priority: priority || 'medium',
      due_date: due_date || null,
      bucket: bucket || 'General',
      tags: tags || [],
      recurrence: recurrence || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
