import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET: List all habits with today's completion status
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const today = new Date().toISOString().split('T')[0];
  const startOfDay = `${today}T00:00:00.000Z`;
  const endOfDay = `${today}T23:59:59.999Z`;

  const { data: habits } = await supabaseAdmin
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (!habits?.length) return Response.json({ habits: [] });

  // Check today's completions
  const habitIds = habits.map(h => h.id);
  const { data: todayLogs } = await supabaseAdmin
    .from('habit_logs')
    .select('habit_id')
    .in('habit_id', habitIds)
    .gte('completed_at', startOfDay)
    .lte('completed_at', endOfDay);

  const completedToday = new Set((todayLogs ?? []).map(l => l.habit_id));

  const result = habits.map(h => ({
    ...h,
    completedToday: completedToday.has(h.id),
  }));

  return Response.json({ habits: result });
}

// POST: Create a new habit
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { name, frequency } = await req.json();
  if (!name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('habits')
    .insert({
      user_id: userId,
      name: name.trim(),
      frequency: frequency || 'daily',
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ habit: data });
}

// PATCH: Toggle habit completion for today, or update habit
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id, action, name, active } = await req.json();
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  // Toggle completion
  if (action === 'toggle') {
    const today = new Date().toISOString().split('T')[0];
    const startOfDay = `${today}T00:00:00.000Z`;
    const endOfDay = `${today}T23:59:59.999Z`;

    // Check if already completed today
    const { data: existing } = await supabaseAdmin
      .from('habit_logs')
      .select('id')
      .eq('habit_id', id)
      .gte('completed_at', startOfDay)
      .lte('completed_at', endOfDay)
      .limit(1);

    if (existing?.length) {
      // Undo completion
      await supabaseAdmin.from('habit_logs').delete().eq('id', existing[0].id);
      // Decrement streak
      const { data: h } = await supabaseAdmin.from('habits').select('current_streak').eq('id', id).single();
      const newStreak = Math.max(0, (h?.current_streak || 1) - 1);
      await supabaseAdmin.from('habits').update({ current_streak: newStreak }).eq('id', id);
      return Response.json({ completed: false });
    } else {
      // Mark completed
      await supabaseAdmin.from('habit_logs').insert({ habit_id: id, user_id: userId });
      // Increment streak
      const { data: habit } = await supabaseAdmin
        .from('habits')
        .select('current_streak, best_streak')
        .eq('id', id)
        .single();

      if (habit) {
        const newStreak = (habit.current_streak || 0) + 1;
        const bestStreak = Math.max(newStreak, habit.best_streak || 0);
        await supabaseAdmin
          .from('habits')
          .update({ current_streak: newStreak, best_streak: bestStreak })
          .eq('id', id);
      }
      return Response.json({ completed: true });
    }
  }

  // Update habit properties
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (active !== undefined) updates.active = active;

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('habits').update(updates).eq('id', id).eq('user_id', userId);
  }

  return Response.json({ ok: true });
}

// DELETE: Remove a habit
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await supabaseAdmin.from('habits').delete().eq('id', id).eq('user_id', userId);
  return Response.json({ ok: true });
}
