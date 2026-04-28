import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('todos')
    .select('id, title, description, status, priority, due_date, bucket, tags, recurrence, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ todo: data });
}

function getNextRecurrenceDate(recurrence: string, fromDate?: string): string | null {
  const now = fromDate ? new Date(fromDate) : new Date();
  switch (recurrence) {
    case 'daily':
      now.setDate(now.getDate() + 1);
      break;
    case 'weekly':
      now.setDate(now.getDate() + 7);
      break;
    case 'biweekly':
      now.setDate(now.getDate() + 14);
      break;
    case 'monthly':
      now.setMonth(now.getMonth() + 1);
      break;
    default:
      return null;
  }
  return now.toISOString().split('T')[0];
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const updates = await req.json();
  const allowed = ['title', 'description', 'status', 'priority', 'due_date', 'bucket', 'tags', 'recurrence'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  // If marking as done, check if it's a recurring task
  if (filtered.status === 'done') {
    const { data: todo } = await supabaseAdmin
      .from('todos')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (todo?.recurrence) {
      const nextDue = getNextRecurrenceDate(todo.recurrence, todo.due_date);
      if (nextDue) {
        // Create next instance
        await supabaseAdmin.from('todos').insert({
          user_id: userId,
          title: todo.title,
          description: todo.description,
          status: 'todo',
          priority: todo.priority,
          due_date: nextDue,
          bucket: todo.bucket,
          tags: todo.tags,
          recurrence: todo.recurrence,
        });
      }
    }
  }

  const { error } = await supabaseAdmin
    .from('todos')
    .update(filtered)
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
    .from('todos')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
