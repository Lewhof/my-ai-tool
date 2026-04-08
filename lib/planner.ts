import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { getMicrosoftToken } from '@/lib/microsoft-token';

export interface PlanBlock {
  id: string;
  time: string;       // HH:MM
  endTime: string;     // HH:MM
  title: string;
  type: 'calendar' | 'task' | 'focus' | 'break';
  refId?: string;      // todo id or calendar event id
  priority?: string;
  locked: boolean;     // calendar events are locked
  duration: number;    // minutes
}

export interface DailyPlan {
  id: string;
  plan_date: string;
  blocks: PlanBlock[];
  locked: boolean;
  created_at: string;
}

/**
 * Gather data needed for plan generation.
 */
export async function gatherPlannerData(userId: string) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const [todosRes, calendarEvents, habitsRes] = await Promise.all([
    supabaseAdmin
      .from('todos')
      .select('id, title, priority, due_date, status, bucket')
      .eq('user_id', userId)
      .neq('status', 'done')
      .order('priority', { ascending: true })
      .limit(20),
    fetchTodayCalendarEvents(userId),
    supabaseAdmin
      .from('habits')
      .select('id, name, frequency')
      .eq('user_id', userId)
      .eq('active', true),
  ]);

  const todos = todosRes.data ?? [];
  const habits = habitsRes.data ?? [];

  // Separate overdue and due-today
  const overdue = todos.filter(t => t.due_date && t.due_date < today);
  const dueToday = todos.filter(t => t.due_date === today);
  const otherTasks = todos.filter(t => !t.due_date || t.due_date > today);

  return { todos, overdue, dueToday, otherTasks, calendarEvents, habits, today };
}

/**
 * Generate an AI-optimized daily plan.
 */
export async function generateDailyPlan(userId: string): Promise<PlanBlock[]> {
  const data = await gatherPlannerData(userId);
  const now = new Date();

  // Build calendar blocks (locked)
  const calendarBlocks: PlanBlock[] = data.calendarEvents.map((e, i) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    return {
      id: `cal-${i}`,
      time: formatTime(start),
      endTime: formatTime(end),
      title: e.subject,
      type: 'calendar' as const,
      refId: e.id,
      locked: true,
      duration: Math.round((end.getTime() - start.getTime()) / 60000),
    };
  });

  // Build task list for AI
  const priorityOrder: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };
  const sortedTasks = [...data.overdue, ...data.dueToday, ...data.otherTasks]
    .sort((a, b) => (priorityOrder[a.priority] ?? 5) - (priorityOrder[b.priority] ?? 5))
    .slice(0, 10);

  if (sortedTasks.length === 0 && calendarBlocks.length === 0) {
    return [];
  }

  const calendarContext = calendarBlocks.length > 0
    ? calendarBlocks.map(b => `- ${b.time}-${b.endTime}: ${b.title} (LOCKED)`).join('\n')
    : 'No calendar events today.';

  const taskContext = sortedTasks.map((t, i) =>
    `${i + 1}. [${t.priority}] ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ''}${data.overdue.includes(t) ? ' OVERDUE' : ''}`
  ).join('\n');

  const habitContext = data.habits.length > 0
    ? `Daily habits: ${data.habits.map(h => h.name).join(', ')}`
    : '';

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are a personal planning AI. Create an optimized daily schedule.

Current time: ${now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })}
Today: ${now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg' })}

LOCKED Calendar Events (cannot be moved):
${calendarContext}

Tasks to schedule (prioritized):
${taskContext}

${habitContext}

Rules:
1. NEVER overlap with locked calendar events
2. Place urgent/overdue tasks in the first available gap
3. Tasks due today come before backlog items
4. Add 2-hour "Focus Block" if there's a gap >= 2 hours with no meetings
5. Add a 15-min break every 2 hours of work
6. Schedule between 07:00 and 19:00 only
7. Estimate 30-60 min per task based on complexity

Return ONLY a JSON array of blocks. Each block:
{"time":"HH:MM","endTime":"HH:MM","title":"...","type":"task|focus|break","taskIndex":N,"duration":N}

taskIndex is the 1-based index from the task list (omit for focus/break blocks).
Respond with ONLY the JSON array.`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return calendarBlocks;

    const aiBlocks = JSON.parse(jsonMatch[0]) as Array<{
      time: string;
      endTime: string;
      title: string;
      type: string;
      taskIndex?: number;
      duration: number;
    }>;

    const taskBlocks: PlanBlock[] = aiBlocks.map((b, i) => ({
      id: `ai-${i}`,
      time: b.time,
      endTime: b.endTime,
      title: b.title,
      type: (b.type === 'focus' ? 'focus' : b.type === 'break' ? 'break' : 'task') as PlanBlock['type'],
      refId: b.taskIndex ? sortedTasks[b.taskIndex - 1]?.id : undefined,
      priority: b.taskIndex ? sortedTasks[b.taskIndex - 1]?.priority : undefined,
      locked: false,
      duration: b.duration || 30,
    }));

    // Merge and sort by time
    const allBlocks = [...calendarBlocks, ...taskBlocks].sort((a, b) => a.time.localeCompare(b.time));
    return allBlocks;
  } catch {
    return calendarBlocks;
  }
}

/**
 * Save a daily plan to the database.
 */
export async function saveDailyPlan(userId: string, date: string, blocks: PlanBlock[], locked: boolean) {
  const { data, error } = await supabaseAdmin
    .from('daily_plans')
    .upsert({
      user_id: userId,
      plan_date: date,
      blocks: JSON.stringify(blocks),
      locked,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,plan_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Load a daily plan from the database.
 */
export async function loadDailyPlan(userId: string, date: string): Promise<DailyPlan | null> {
  const { data } = await supabaseAdmin
    .from('daily_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_date', date)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    plan_date: data.plan_date,
    blocks: typeof data.blocks === 'string' ? JSON.parse(data.blocks) : data.blocks,
    locked: data.locked,
    created_at: data.created_at,
  };
}

// ── Helpers ──

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });
}

async function fetchTodayCalendarEvents(userId: string): Promise<Array<{ id: string; subject: string; start: string; end: string }>> {
  try {
    const token = await getMicrosoftToken(userId);
    if (!token) return [];

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startOfDay.toISOString()}&endDateTime=${endOfDay.toISOString()}&$orderby=start/dateTime&$top=20&$select=subject,start,end`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.value ?? []).map((e: { subject: string; start: { dateTime: string }; end: { dateTime: string } }) => ({
      id: e.subject, // MS Graph IDs are long, use subject as display ID
      subject: e.subject,
      start: e.start.dateTime,
      end: e.end.dateTime,
    }));
  } catch {
    return [];
  }
}
