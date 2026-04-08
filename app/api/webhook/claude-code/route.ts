import { supabaseAdmin } from '@/lib/supabase-server';
import { sendPushToUser } from '@/lib/push';

// Bi-directional webhook: Claude Code → Lewhof AI
// Receives status updates from Claude Code tasks
export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { action, task_id, whiteboard_id, status, result, user_id } = body;

  if (action === 'status_update') {
    // Update task status
    if (task_id) {
      await supabaseAdmin
        .from('task_queue')
        .update({ status, result: result || null, updated_at: new Date().toISOString() })
        .eq('id', task_id);
    }

    // Update whiteboard item status
    if (whiteboard_id) {
      const wbStatus = status === 'completed' ? 'done' : status === 'failed' ? 'idea' : 'in-progress';
      await supabaseAdmin
        .from('whiteboard')
        .update({ status: wbStatus })
        .eq('id', whiteboard_id);
    }

    // Send push notification
    if (user_id) {
      const title = status === 'completed' ? 'Task completed' : status === 'failed' ? 'Task failed' : 'Task update';
      const taskTitle = result?.title || 'Claude Code task';
      await sendPushToUser(user_id, {
        title,
        body: typeof taskTitle === 'string' ? taskTitle.slice(0, 120) : 'Status updated',
        tag: 'claude-code',
        url: '/whiteboard',
      });
    }

    return Response.json({ ok: true });
  }

  if (action === 'create_item') {
    // Claude Code pushes a new whiteboard/task item
    const { title, description, type } = body;

    if (type === 'whiteboard' && user_id) {
      const { data } = await supabaseAdmin.from('whiteboard').insert({
        user_id,
        title,
        description: description || null,
        status: 'idea',
        priority: 99,
        tags: ['claude-code', 'agent-pushed'],
      }).select('id').single();

      return Response.json({ ok: true, id: data?.id });
    }

    if (type === 'task' && user_id) {
      const { data } = await supabaseAdmin.from('task_queue').insert({
        user_id,
        title,
        description: description || null,
        status: 'pending',
      }).select('id').single();

      return Response.json({ ok: true, id: data?.id });
    }
  }

  if (action === 'get_status') {
    // Claude Code queries task status
    if (task_id) {
      const { data } = await supabaseAdmin
        .from('task_queue')
        .select('id, title, status, result')
        .eq('id', task_id)
        .single();

      return Response.json({ task: data });
    }
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}

// GET — health check + pending tasks for Claude Code to pick up
export async function GET(req: Request) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: pending } = await supabaseAdmin
    .from('task_queue')
    .select('id, title, description, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10);

  return Response.json({
    status: 'ok',
    pending_tasks: pending ?? [],
    timestamp: new Date().toISOString(),
  });
}
