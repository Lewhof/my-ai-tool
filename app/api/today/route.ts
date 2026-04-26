import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

interface NextAction {
  id: string;
  title: string;
  reason: 'overdue' | 'due_today' | 'urgent' | 'next_in_priority';
  priority: string;
  due_date: string | null;
}

interface ChangeItem {
  kind: 'todo_done' | 'note_created' | 'kb_created' | 'metric_logged' | 'workout_done';
  title: string;
  at: string;
  href?: string;
}

interface TodayResponse {
  briefing: { content: string; cached: boolean } | null;
  next_action: NextAction | null;
  changes: ChangeItem[];
  stats: {
    todos_due_today: number;
    todos_overdue: number;
    todos_done_today: number;
    calendar_events_today: number;
  };
}

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

  // Promise.allSettled: a missing/renamed table or transient Supabase
  // error in one source must NOT take down the whole /today response.
  const settled = await Promise.allSettled([
    supabaseAdmin
      .from('briefings').select('content').eq('user_id', userId).eq('date', today).limit(1).maybeSingle(),
    supabaseAdmin
      .from('todos').select('id, title, priority, due_date, status, updated_at')
      .eq('user_id', userId).neq('status', 'done')
      .order('priority', { ascending: true }).limit(50),
    supabaseAdmin
      .from('todos').select('id, title, updated_at')
      .eq('user_id', userId).eq('status', 'done')
      .gte('updated_at', startOfDay.toISOString())
      .order('updated_at', { ascending: false }).limit(20),
    supabaseAdmin
      .from('notes').select('id, title, created_at')
      .eq('user_id', userId).gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false }).limit(10),
    supabaseAdmin
      .from('knowledge_base').select('id, title, created_at')
      .eq('user_id', userId).gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false }).limit(10),
    supabaseAdmin
      .from('body_metrics').select('id, metric_type, value, recorded_at')
      .eq('user_id', userId).gte('recorded_at', startOfDay.toISOString())
      .order('recorded_at', { ascending: false }).limit(10),
  ]);

  type Settled<T> = { data: T | null };
  const get = <T>(i: number, fallback: T): T => {
    const r = settled[i];
    if (r.status !== 'fulfilled') return fallback;
    const v = (r.value as Settled<T>).data;
    return v ?? fallback;
  };

  const briefingRes = { data: get<{ content: string } | null>(0, null) };
  const openTodos = get<Array<{ id: string; title: string; priority: string; due_date: string | null; status: string; updated_at: string }>>(1, []);
  const doneToday = get<Array<{ id: string; title: string; updated_at: string }>>(2, []);
  const notesToday = get<Array<{ id: string; title: string; created_at: string }>>(3, []);
  const kbToday = get<Array<{ id: string; title: string; created_at: string }>>(4, []);
  const metricsToday = get<Array<{ id: string; metric_type: string; value: number; recorded_at: string }>>(5, []);
  const overdue = openTodos.filter(t => t.due_date && t.due_date < today);
  const dueToday = openTodos.filter(t => t.due_date === today);

  const next_action = pickNextAction(openTodos, overdue, dueToday);

  const changes: ChangeItem[] = [];
  for (const t of doneToday) changes.push({ kind: 'todo_done', title: t.title, at: t.updated_at, href: '/todos' });
  for (const n of notesToday) changes.push({ kind: 'note_created', title: n.title || 'Untitled note', at: n.created_at, href: '/notes' });
  for (const k of kbToday) changes.push({ kind: 'kb_created', title: k.title, at: k.created_at, href: '/kb' });
  for (const m of metricsToday) changes.push({ kind: 'metric_logged', title: `${m.metric_type}: ${m.value}`, at: m.recorded_at, href: '/wellness' });
  changes.sort((a, b) => b.at.localeCompare(a.at));

  const response: TodayResponse = {
    briefing: briefingRes.data ? { content: briefingRes.data.content, cached: true } : null,
    next_action,
    changes: changes.slice(0, 12),
    stats: {
      todos_due_today: dueToday.length,
      todos_overdue: overdue.length,
      todos_done_today: doneToday.length,
      calendar_events_today: 0,
    },
  };

  return Response.json(response, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
  });
}

type OpenTodo = { id: string; title: string; priority: string; due_date: string | null };

function pickNextAction(open: OpenTodo[], overdue: OpenTodo[], dueToday: OpenTodo[]): NextAction | null {
  if (overdue.length > 0) {
    const t = overdue.sort(byPriority)[0];
    return { id: t.id, title: t.title, reason: 'overdue', priority: t.priority, due_date: t.due_date };
  }
  if (dueToday.length > 0) {
    const t = dueToday.sort(byPriority)[0];
    return { id: t.id, title: t.title, reason: 'due_today', priority: t.priority, due_date: t.due_date };
  }
  const urgent = open.find(t => t.priority === 'urgent');
  if (urgent) return { id: urgent.id, title: urgent.title, reason: 'urgent', priority: 'urgent', due_date: urgent.due_date };
  const next = open.sort(byPriority)[0];
  if (next) return { id: next.id, title: next.title, reason: 'next_in_priority', priority: next.priority, due_date: next.due_date };
  return null;
}

function byPriority(a: OpenTodo, b: OpenTodo): number {
  return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
}
