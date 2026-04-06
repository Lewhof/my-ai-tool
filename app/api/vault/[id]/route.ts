import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  // Return the actual (unmasked) value
  const { data } = await supabaseAdmin
    .from('vault_keys')
    .select('id, name, service, value, created_at')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!data) return new Response('Not found', { status: 404 });
  return Response.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { name, service, value } = await req.json();
  const updates: Record<string, string> = {};
  if (name) updates.name = name;
  if (service) updates.service = service;
  if (value) {
    updates.value = value;
    updates.masked_value = value.length > 16
      ? value.slice(0, 8) + '...' + value.slice(-4)
      : '****';
  }

  const { error } = await supabaseAdmin
    .from('vault_keys')
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
    .from('vault_keys')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
