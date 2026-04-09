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
  accountLabel?: string; // which calendar this event came from
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

  // Build calendar blocks (locked) — now with account labels
  const calendarBlocks: PlanBlock[] = data.calendarEvents.map((e, i) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const label = ('accountLabel' in e ? (e as { accountLabel?: string }).accountLabel : '') || '';
    return {
      id: `cal-${i}`,
      time: formatTime(start),
      endTime: formatTime(end),
      title: label ? `${e.subject} [${label}]` : e.subject,
      type: 'calendar' as const,
      refId: e.id,
      accountLabel: label,
      locked: true,
      duration: Math.round((end.getTime() - start.getTime()) / 60000),
    };
  });

  // Build task list for AI
  const priorityOrder: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };
  const sortedTasks = [...data.overdue, ...data.dueToday, ...data.otherTasks]
    .sort((a, b) => (priorityOrder[a.priority] ?? 5) - (priorityOrder[b.priority] ?? 5))
    .slice(0, 12);

  // Nothing to schedule at all
  if (sortedTasks.length === 0 && calendarBlocks.length === 0) {
    return [];
  }

  // No tasks — just return the calendar (a valid plan)
  if (sortedTasks.length === 0) {
    return calendarBlocks;
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

  // Current time for "schedule starting from now"
  const currentTimeStr = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });

  let aiText = '';
  try {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `You are a personal planning AI. Create an optimized daily schedule.

Current time: ${currentTimeStr}
Today: ${now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg' })}

LOCKED Calendar Events (cannot be moved, already scheduled):
${calendarContext}

Tasks to schedule (prioritized, highest priority first):
${taskContext}

${habitContext}

Rules:
1. NEVER overlap with LOCKED calendar events
2. Place overdue and urgent tasks in the FIRST available gaps
3. Tasks due today come before backlog items
4. Add a "Focus Block" if there's a gap of 2+ hours with no meetings
5. Add a 15-min break every 2 hours of work
6. Schedule between 07:00 and 19:00 only
7. Estimate 30-60 min per task based on complexity (default 45 min)
8. Fill the day — schedule as many tasks as fit

Return ONLY a JSON array of blocks. Each block must have ALL these fields:
{"time":"HH:MM","endTime":"HH:MM","title":"task title","type":"task","taskIndex":1,"duration":45}

- type: "task" for todos, "focus" for focus blocks, "break" for breaks
- taskIndex: 1-based index from the task list (only for task blocks; omit for focus/break)
- duration: minutes (integer)

Do NOT include locked calendar events in your response — they're already scheduled.
Return ONLY the JSON array. No prose, no markdown, no code fences.`,
      }],
    });

    aiText = response.content[0].type === 'text' ? response.content[0].text : '';
  } catch (err) {
    console.error('[planner] AI call failed:', err);
    return calendarBlocks;
  }

  // Parse AI response — strip fences if present, then extract first JSON array
  let jsonText = aiText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('[planner] AI returned no JSON array:', aiText.slice(0, 300));
    return calendarBlocks;
  }
  jsonText = jsonMatch[0];

  let aiBlocks: Array<{
    time?: string;
    endTime?: string;
    title?: string;
    type?: string;
    taskIndex?: number;
    duration?: number;
  }>;
  try {
    aiBlocks = JSON.parse(jsonText);
  } catch (err) {
    console.error('[planner] JSON parse failed:', err, jsonText.slice(0, 300));
    return calendarBlocks;
  }

  if (!Array.isArray(aiBlocks)) {
    console.error('[planner] AI returned non-array:', aiText.slice(0, 200));
    return calendarBlocks;
  }

  const taskBlocks: PlanBlock[] = aiBlocks
    .filter(b => b && b.time && b.title)
    .map((b, i) => ({
      id: `ai-${i}`,
      time: b.time!,
      endTime: b.endTime || addMinutes(b.time!, b.duration || 45),
      title: b.title!,
      type: (b.type === 'focus' ? 'focus' : b.type === 'break' ? 'break' : 'task') as PlanBlock['type'],
      refId: b.taskIndex ? sortedTasks[b.taskIndex - 1]?.id : undefined,
      priority: b.taskIndex ? sortedTasks[b.taskIndex - 1]?.priority : undefined,
      locked: false,
      duration: b.duration || 45,
    }));

  // Merge and sort by time
  const allBlocks = [...calendarBlocks, ...taskBlocks].sort((a, b) => a.time.localeCompare(b.time));
  return allBlocks;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Save a daily plan to the database.
 * blocks is JSONB — pass the array directly, NOT JSON.stringify'd.
 */
export async function saveDailyPlan(userId: string, date: string, blocks: PlanBlock[], locked: boolean) {
  const { data, error } = await supabaseAdmin
    .from('daily_plans')
    .upsert({
      user_id: userId,
      plan_date: date,
      blocks,                                  // ← JSONB: pass array directly
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
 * Handles both JSONB (object) and legacy string-stored blocks.
 */
export async function loadDailyPlan(userId: string, date: string): Promise<DailyPlan | null> {
  const { data, error } = await supabaseAdmin
    .from('daily_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_date', date)
    .maybeSingle();

  if (error || !data) return null;

  let blocks: PlanBlock[];
  if (typeof data.blocks === 'string') {
    try {
      blocks = JSON.parse(data.blocks);
    } catch {
      blocks = [];
    }
  } else if (Array.isArray(data.blocks)) {
    blocks = data.blocks;
  } else {
    blocks = [];
  }

  return {
    id: data.id,
    plan_date: data.plan_date,
    blocks,
    locked: data.locked,
    created_at: data.created_at,
  };
}

// ── Helpers ──

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });
}

async function fetchTodayCalendarEvents(userId: string): Promise<Array<{ id: string; subject: string; start: string; end: string; accountLabel: string }>> {
  try {
    // Get ALL Microsoft accounts (personal + work)
    const { data: accounts } = await supabaseAdmin
      .from('calendar_accounts')
      .select('id, label, alias, provider')
      .eq('user_id', userId)
      .in('provider', ['microsoft', 'microsoft-work']);

    if (!accounts || accounts.length === 0) return [];

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const allEvents = await Promise.all(
      accounts.map(async (account) => {
        try {
          const token = await getMicrosoftToken(userId, account.id);
          if (!token) return [];

          const res = await fetch(
            `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startOfDay.toISOString()}&endDateTime=${endOfDay.toISOString()}&$top=100&$select=subject,start,end`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Prefer: 'outlook.timezone="Africa/Johannesburg"',
              },
            }
          );
          if (!res.ok) return [];
          const data = await res.json();
          const label = account.alias || account.label || '';
          return (data.value ?? []).map((e: { subject: string; start: { dateTime: string }; end: { dateTime: string } }, idx: number) => ({
            id: `${account.id}-${idx}`,
            subject: e.subject,
            start: e.start.dateTime,
            end: e.end.dateTime,
            accountLabel: label,
          }));
        } catch {
          return [];
        }
      })
    );

    // Flatten, dedupe by subject+start (same meeting on both accounts), sort
    const flat = allEvents.flat();
    const seen = new Set<string>();
    const deduped = flat.filter(e => {
      const key = `${e.subject}|${e.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  } catch {
    return [];
  }
}
