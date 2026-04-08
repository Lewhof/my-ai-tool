import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('task_queue')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tasks: data });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { title, description, whiteboard_id, status: taskStatus } = await req.json();
  if (!title?.trim()) return Response.json({ error: 'Title required' }, { status: 400 });

  // F1: Dedup — skip if same title exists in last 24h
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: existing } = await supabaseAdmin
    .from('task_queue')
    .select('id, title, status')
    .eq('user_id', userId)
    .ilike('title', title)
    .gte('created_at', oneDayAgo)
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .limit(1);

  if (existing?.length) {
    return Response.json({ ...existing[0], deduplicated: true });
  }

  const { data, error } = await supabaseAdmin
    .from('task_queue')
    .insert({
      user_id: userId,
      title,
      description: description || null,
      whiteboard_id: whiteboard_id || null,
      ...(taskStatus ? { status: taskStatus } : {}),
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
