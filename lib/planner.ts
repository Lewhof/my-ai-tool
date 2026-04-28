import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { fetchCalendarEvents, type CalendarEvent } from '@/lib/calendar-events';

export interface PlanBlock {
  id: string;
  time: string;       // HH:MM
  endTime: string;     // HH:MM
  title: string;
  type: 'calendar' | 'task' | 'focus' | 'break' | 'fitness';
  refId?: string;      // todo id, calendar event id, or 'lhfitness:<sched-id>'
  priority?: string;
  accountLabel?: string; // which calendar this event came from
  locked: boolean;     // calendar events + fitness sessions are locked
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

  // Build calendar blocks (locked) — now with account labels.
  // LH Fitness sessions arrive through the same aggregator with
  // accountId === 'lhfitness'; they emit as fitness-typed locked blocks
  // so the planner timeline tints them orange via TYPE_CONFIG.
  const calendarBlocks: PlanBlock[] = data.calendarEvents.map((e, i) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const isFitness = e.accountId === 'lhfitness';
    const label = e.accountLabel || '';
    return {
      id: `cal-${i}`,
      time: formatTime(start),
      endTime: formatTime(end),
      title: isFitness || !label ? e.subject : `${e.subject} [${label}]`,
      type: isFitness ? 'fitness' as const : 'calendar' as const,
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
    ? calendarBlocks.map(b => `- ${b.time}-${b.endTime}: ${b.title} (LOCKED${b.type === 'fitness' ? ' · FITNESS' : ''})`).join('\n')
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
4. Only add a "Focus Block" if there is a gap of 3+ hours with NO meetings AND no tasks to fill it — maximum 1 per day
5. Only add a "Break" if the schedule has 3+ consecutive hours of back-to-back work with no gaps — maximum 2 per day, 15 min each
6. Schedule between 05:00 and 22:00 only (early-bird and late-evening focus blocks are allowed when warranted)
7. Estimate 30-60 min per task based on complexity (default 45 min)
8. PRIORITIZE scheduling tasks over adding breaks/focus blocks — fill gaps with tasks first
9. Do NOT place a break or focus block between two calendar events that are less than 30 min apart

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

  // Guard against Haiku echoing locked blocks (especially fitness sessions)
  // back into its output as plain task blocks — drop any AI block whose
  // title matches a locked title.
  const lockedTitles = new Set(calendarBlocks.map(b => b.title.toLowerCase()));

  const taskBlocks: PlanBlock[] = aiBlocks
    .filter(b => b && b.time && b.title && !lockedTitles.has(b.title.toLowerCase()))
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

  // Enforce no overlaps — AI sometimes ignores the instruction
  const resolvedTasks = resolveOverlaps(calendarBlocks, taskBlocks);

  // Merge and sort by time
  const allBlocks = [...calendarBlocks, ...resolvedTasks].sort((a, b) => a.time.localeCompare(b.time));
  return allBlocks;
}

/**
 * Post-AI overlap resolver.
 * Validates AI-generated blocks against locked calendar events and each other.
 * Shifts blocks forward to the next available gap; drops if no room.
 */
function resolveOverlaps(calendarBlocks: PlanBlock[], aiBlocks: PlanBlock[]): PlanBlock[] {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const toHHMM = (min: number) =>
    `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  const DAY_START = 5 * 60;   // 05:00
  const DAY_END   = 22 * 60;  // 22:00

  // Build occupied intervals from calendar blocks
  const occupied: Array<{ start: number; end: number }> = calendarBlocks.map(b => ({
    start: toMin(b.time),
    end: toMin(b.endTime),
  }));

  const resolved: PlanBlock[] = [];

  for (const block of aiBlocks) {
    let start = toMin(block.time);
    const dur = block.duration;
    let end = start + dur;

    // Clamp start to day bounds
    if (start < DAY_START) { start = DAY_START; end = start + dur; }

    // Won't fit in the day at all
    if (end > DAY_END) {
      // Try squeezing into a gap instead of giving up
      const gap = findNextGap(occupied, DAY_START, DAY_END, dur);
      if (!gap) continue;
      start = gap;
      end = start + dur;
    }

    // Shift forward past any overlapping occupied interval
    let shifted = true;
    let attempts = 0;
    while (shifted && attempts < 40) {
      shifted = false;
      for (const o of occupied) {
        if (start < o.end && end > o.start) {
          start = o.end;
          end = start + dur;
          shifted = true;
          break;
        }
      }
      attempts++;
    }

    // Final bounds + overlap check
    if (end > DAY_END || start < DAY_START) continue;
    if (occupied.some(o => start < o.end && end > o.start)) continue;

    // Accept the block
    occupied.push({ start, end });
    resolved.push({
      ...block,
      time: toHHMM(start),
      endTime: toHHMM(end),
    });
  }

  return resolved;
}

/**
 * Find the earliest gap of at least `minDuration` minutes between occupied intervals.
 */
function findNextGap(
  occupied: Array<{ start: number; end: number }>,
  dayStart: number,
  dayEnd: number,
  minDuration: number,
): number | null {
  const sorted = [...occupied].sort((a, b) => a.start - b.start);
  let cursor = dayStart;

  for (const slot of sorted) {
    if (slot.start - cursor >= minDuration) return cursor;
    cursor = Math.max(cursor, slot.end);
  }

  // Check gap after last occupied slot
  if (dayEnd - cursor >= minDuration) return cursor;
  return null;
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

async function fetchTodayCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  try {
    // SAST-anchored day window. The previous server-local-time computation
    // missed early-morning SAST events on Vercel's UTC servers (their UTC
    // instant fell in the previous calendar day's window).
    const now = new Date();
    const sastNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const today = sastNow.toISOString().slice(0, 10);
    const startIso = new Date(`${today}T00:00:00+02:00`).toISOString();
    const endIso = new Date(`${today}T23:59:59.999+02:00`).toISOString();
    return await fetchCalendarEvents(userId, startIso, endIso);
  } catch {
    return [];
  }
}
