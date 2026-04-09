import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { ensureDefaultVirtues, getCurrentVirtue, getWeekOf } from '@/lib/practice';

// GET: Return virtue definitions + current week virtue + this week's logs
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Seed defaults if empty
  await ensureDefaultVirtues(userId);

  const { data: definitions } = await supabaseAdmin
    .from('virtue_definitions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('position', { ascending: true });

  const defs = definitions ?? [];
  const current = getCurrentVirtue(defs, new Date());
  const weekOf = getWeekOf(new Date());

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode');

  if (mode === 'quarter') {
    // Last 90 days of logs for the heatmap
    const since = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    const { data: logs } = await supabaseAdmin
      .from('virtue_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('day_date', since)
      .order('day_date', { ascending: true });
    return Response.json({ definitions: defs, current, weekOf, logs: logs ?? [] });
  }

  // Default: this week's logs only
  const weekEnd = new Date(weekOf);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const { data: weekLogs } = await supabaseAdmin
    .from('virtue_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('day_date', weekOf)
    .lte('day_date', weekEnd.toISOString().split('T')[0]);

  return Response.json({ definitions: defs, current, weekOf, logs: weekLogs ?? [] });
}

// POST: Add a custom virtue
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { name, description } = await req.json();
  if (!name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 });

  // Find next position
  const { data: existing } = await supabaseAdmin
    .from('virtue_definitions')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from('virtue_definitions')
    .insert({
      user_id: userId,
      name: name.trim(),
      description: description?.trim() || null,
      position: nextPosition,
      is_custom: true,
      active: true,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ virtue: data });
}

// PATCH: Log a virtue score, rename, reorder, or deactivate
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { action } = body;

  // Log a daily score: { action: 'log', virtue, score, note }
  if (action === 'log') {
    const { virtue, score, note } = body;
    if (!virtue || score == null) return Response.json({ error: 'virtue and score required' }, { status: 400 });
    const today = new Date().toISOString().split('T')[0];
    const weekOf = getWeekOf(new Date());

    const { error } = await supabaseAdmin
      .from('virtue_logs')
      .upsert({
        user_id: userId,
        virtue,
        week_of: weekOf,
        day_date: today,
        score: Number(score),
        note: note || null,
      }, { onConflict: 'user_id,day_date' });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // Update a virtue definition: { action: 'update', id, name, description, position, active }
  if (action === 'update') {
    const { id, name, description, position, active } = body;
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (position !== undefined) updates.position = position;
    if (active !== undefined) updates.active = active;

    const { error } = await supabaseAdmin
      .from('virtue_definitions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}

// DELETE: Remove a virtue definition
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await supabaseAdmin.from('virtue_definitions').delete().eq('id', id).eq('user_id', userId);
  return Response.json({ ok: true });
}
