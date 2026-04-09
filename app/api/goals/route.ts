import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export interface KeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  status: 'on-track' | 'at-risk' | 'completed';
}

const VALID_STATUSES = ['active', 'completed', 'archived'];

// GET: List all goals
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status'); // optional filter

  let query = supabaseAdmin
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status && VALID_STATUSES.includes(status)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ goals: data ?? [] });
}

// POST: Create a new goal
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { title, description, target_date, key_results } = await req.json();

  if (!title?.trim()) {
    return Response.json({ error: 'Title required' }, { status: 400 });
  }

  // Normalize key_results: ensure each has an id
  const normalizedKRs = Array.isArray(key_results)
    ? key_results.map((kr, i) => ({
        id: kr.id || `kr-${Date.now()}-${i}`,
        title: kr.title || '',
        target: Number(kr.target) || 0,
        current: Number(kr.current) || 0,
        unit: kr.unit || '',
        status: kr.status || 'on-track',
      }))
    : [];

  const { data, error } = await supabaseAdmin
    .from('goals')
    .insert({
      user_id: userId,
      title: title.trim(),
      description: description?.trim() || null,
      target_date: target_date || null,
      key_results: normalizedKRs,
      status: 'active',
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ goal: data });
}

// PATCH: Update a goal (title, description, status, key_results, target_date)
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id, title, description, target_date, status, key_results } = await req.json();
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (target_date !== undefined) updates.target_date = target_date || null;
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = status;
  }
  if (key_results !== undefined) {
    const normalized = Array.isArray(key_results)
      ? key_results.map((kr, i) => ({
          id: kr.id || `kr-${Date.now()}-${i}`,
          title: kr.title || '',
          target: Number(kr.target) || 0,
          current: Number(kr.current) || 0,
          unit: kr.unit || '',
          status: kr.status || 'on-track',
        }))
      : [];
    updates.key_results = normalized;
  }

  const { data, error } = await supabaseAdmin
    .from('goals')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ goal: data });
}

// DELETE: Remove a goal
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await supabaseAdmin.from('goals').delete().eq('id', id).eq('user_id', userId);
  return Response.json({ ok: true });
}
