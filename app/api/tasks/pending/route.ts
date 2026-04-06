import { supabaseAdmin } from '@/lib/supabase-server';

// Public endpoint for Claude Code to poll — secured by ANTHROPIC_API_KEY as a shared secret
export async function GET(req: Request) {
  const authHeader = req.headers.get('x-api-key');
  if (authHeader !== process.env.ANTHROPIC_API_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('task_queue')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tasks: data });
}

// Claude Code calls this to mark a task as in-progress or completed
export async function PATCH(req: Request) {
  const authHeader = req.headers.get('x-api-key');
  if (authHeader !== process.env.ANTHROPIC_API_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id, status, result } = await req.json();
  if (!id || !status) return Response.json({ error: 'id and status required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('task_queue')
    .update({ status, result: result || null })
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
