import { supabaseAdmin } from '@/lib/supabase-server';

export interface Nudge {
  id: string;
  type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  created_at: string;
}

type NudgeType = 'overdue_task' | 'approaching_deadline' | 'stale_whiteboard' | 'contact_dormant' | 'habit_broken';

/**
 * Generate nudges based on current data state.
 * Called by the cron job. Checks for actionable items and creates nudge records.
 */
export async function generateNudges(userId: string) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
  const nudges: Array<{ type: NudgeType; title: string; body: string; entity_type?: string; entity_id?: string }> = [];

  // 1. Overdue tasks
  const { data: overdue } = await supabaseAdmin
    .from('todos')
    .select('id, title, due_date')
    .eq('user_id', userId)
    .neq('status', 'done')
    .lt('due_date', today)
    .limit(5);

  for (const t of overdue ?? []) {
    const daysOverdue = Math.floor((now.getTime() - new Date(t.due_date).getTime()) / 86400000);
    nudges.push({
      type: 'overdue_task',
      title: `Overdue: ${t.title}`,
      body: `${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue. Complete or reschedule.`,
      entity_type: 'todo',
      entity_id: t.id,
    });
  }

  // 2. Approaching deadlines (due tomorrow)
  const { data: approaching } = await supabaseAdmin
    .from('todos')
    .select('id, title, priority')
    .eq('user_id', userId)
    .neq('status', 'done')
    .eq('due_date', tomorrow)
    .limit(5);

  for (const t of approaching ?? []) {
    nudges.push({
      type: 'approaching_deadline',
      title: `Due tomorrow: ${t.title}`,
      body: `Priority: ${t.priority}. Make sure this is on today's plan.`,
      entity_type: 'todo',
      entity_id: t.id,
    });
  }

  // 3. Stale whiteboard items (idea status for 14+ days)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
  const { data: stale } = await supabaseAdmin
    .from('whiteboard')
    .select('id, title')
    .eq('user_id', userId)
    .eq('status', 'idea')
    .lt('created_at', twoWeeksAgo)
    .limit(3);

  for (const w of stale ?? []) {
    nudges.push({
      type: 'stale_whiteboard',
      title: `Stale idea: ${w.title}`,
      body: 'Been in Ideas for 14+ days. Scope it, park it, or drop it.',
      entity_type: 'whiteboard',
      entity_id: w.id,
    });
  }

  // 4. Dormant contacts (no interaction in 30+ days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const { data: dormant } = await supabaseAdmin
    .from('contacts')
    .select('id, name, email')
    .eq('user_id', userId)
    .lt('last_interaction', thirtyDaysAgo)
    .limit(3);

  for (const c of dormant ?? []) {
    nudges.push({
      type: 'contact_dormant',
      title: `Reconnect: ${c.name}`,
      body: `No contact in 30+ days (${c.email}). Send a quick check-in.`,
      entity_type: 'contact',
      entity_id: c.id,
    });
  }

  // 5. Broken habit streaks (had streak > 3, now 0)
  const { data: brokenHabits } = await supabaseAdmin
    .from('habits')
    .select('id, name, best_streak, current_streak')
    .eq('user_id', userId)
    .eq('active', true)
    .gt('best_streak', 3)
    .eq('current_streak', 0)
    .limit(3);

  for (const h of brokenHabits ?? []) {
    nudges.push({
      type: 'habit_broken',
      title: `Streak broken: ${h.name}`,
      body: `Your best was ${h.best_streak} days. Start rebuilding today.`,
      entity_type: 'habit',
      entity_id: h.id,
    });
  }

  // Deduplicate: don't create nudges that already exist (active, same entity)
  if (nudges.length === 0) return 0;

  const { data: existing } = await supabaseAdmin
    .from('nudges')
    .select('entity_type, entity_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  const existingKeys = new Set((existing ?? []).map(e => `${e.entity_type}:${e.entity_id}`));

  const newNudges = nudges.filter(n => !existingKeys.has(`${n.entity_type}:${n.entity_id}`));

  if (newNudges.length > 0) {
    await supabaseAdmin.from('nudges').insert(
      newNudges.map(n => ({ user_id: userId, ...n }))
    );
  }

  return newNudges.length;
}
