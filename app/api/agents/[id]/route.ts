import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data: agent } = await supabaseAdmin
    .from('user_agents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!agent) return new Response('Not found', { status: 404 });

  const { data: runs } = await supabaseAdmin
    .from('agent_runs')
    .select('id, status, output, actions_taken, created_at')
    .eq('agent_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  return Response.json({ agent, runs: runs ?? [] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const updates = await req.json();
  const allowed = ['name', 'description', 'prompt', 'schedule', 'trigger_type', 'trigger_event', 'actions', 'enabled'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  const { error } = await supabaseAdmin
    .from('user_agents')
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
    .from('user_agents')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
