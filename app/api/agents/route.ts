import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('user_agents')
    .select('*, agent_runs(id, status, created_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const agents = (data ?? []).map((a) => ({
    ...a,
    last_run: (a.agent_runs as Array<Record<string, unknown>>)?.sort(
      (x, y) => new Date(y.created_at as string).getTime() - new Date(x.created_at as string).getTime()
    )[0] ?? null,
    run_count: (a.agent_runs as Array<unknown>)?.length ?? 0,
    agent_runs: undefined,
  }));

  return Response.json({ agents });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { name, description, prompt, schedule, trigger_type, trigger_event, actions } = await req.json();
  if (!name?.trim() || !prompt?.trim()) return Response.json({ error: 'Name and prompt required' }, { status: 400 });

  // Calculate next_run_at for scheduled agents
  let next_run_at = null;
  if (trigger_type === 'scheduled' && schedule) {
    next_run_at = new Date(Date.now() + 60000).toISOString(); // First run in 1 minute
  }

  const { data, error } = await supabaseAdmin
    .from('user_agents')
    .insert({
      user_id: userId,
      name,
      description: description || null,
      prompt,
      schedule: schedule || null,
      trigger_type: trigger_type || 'manual',
      trigger_event: trigger_event || null,
      actions: actions || [],
      next_run_at,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
