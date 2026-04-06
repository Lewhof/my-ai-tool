import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data: workflow } = await supabaseAdmin
    .from('workflows')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!workflow) return new Response('Not found', { status: 404 });

  const { data: runs } = await supabaseAdmin
    .from('workflow_runs')
    .select('id, input, output, status, created_at')
    .eq('workflow_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return Response.json({ workflow, runs: runs ?? [] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const updates = await req.json();
  const { error } = await supabaseAdmin
    .from('workflows')
    .update(updates)
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
    .from('workflows')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
