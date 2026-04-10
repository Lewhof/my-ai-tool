import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET  /api/agent/rules          — list all rules (active + inactive)
// POST /api/agent/rules          — create { rule, category, source? }
// PATCH /api/agent/rules         — update { id, rule?, category?, active? }
// DELETE /api/agent/rules?id=... — hard delete

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('cerebro_rules')
    .select('id, rule, category, source, active, hits, created_at, updated_at')
    .eq('user_id', userId)
    .order('active', { ascending: false })
    .order('category', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ rules: data ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const rule = (body.rule as string | undefined)?.trim();
  const category = (body.category as string | undefined) || 'prefer';
  const source = (body.source as string | undefined) || 'manual';

  if (!rule) return Response.json({ error: 'rule required' }, { status: 400 });
  if (!['do', 'dont', 'prefer'].includes(category)) {
    return Response.json({ error: 'invalid category' }, { status: 400 });
  }
  if (!['manual', 'reflection', 'feedback', 'self'].includes(source)) {
    return Response.json({ error: 'invalid source' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('cerebro_rules')
    .insert({ user_id: userId, rule, category, source, active: true })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ rule: data });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { id, rule, category, active } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof rule === 'string') updates.rule = rule.trim();
  if (typeof category === 'string' && ['do', 'dont', 'prefer'].includes(category)) updates.category = category;
  if (typeof active === 'boolean') updates.active = active;

  const { data, error } = await supabaseAdmin
    .from('cerebro_rules')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ rule: data });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('cerebro_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
