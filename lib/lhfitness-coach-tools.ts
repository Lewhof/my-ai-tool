import { supabaseAdmin } from '@/lib/supabase-server';
import type { FitnessState, ScheduledSession, ScheduledStatus, Workout } from '@/app/lhfitness/types';

// Server-side tool registry + dispatcher for the LH Fitness coach.
//
// The coach v2 endpoint runs the standard Anthropic tool-use loop:
//   model emits tool_use → executeCoachTool() runs the mutation against
//   lhfitness_state → tool_result feeds back into the next turn so the
//   coach can confirm with the actual outcome.
//
// All mutations are scoped to the authenticated userId; the dispatcher
// never accepts a userId from tool input.

// ── Tool definitions (Anthropic Messages tools array) ───────────────────

export const COACH_TOOLS = [
  {
    name: 'get_schedule',
    description:
      "Read the user's scheduled training sessions in a date range. " +
      'Use this BEFORE making changes when the reference is ambiguous (e.g. "today", "this week"). ' +
      'Returns: array of { id, date, status, workout_name, plan_name, ai_template }.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from: { type: 'string', description: 'ISO date YYYY-MM-DD (inclusive)' },
        to: { type: 'string', description: 'ISO date YYYY-MM-DD (inclusive)' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'mark_rest_day',
    description:
      'Mark all scheduled sessions on a given date as skipped, turning the day into a rest day. ' +
      'Idempotent — calling it on an already-rest day is a no-op.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
      },
      required: ['date'],
    },
  },
  {
    name: 'skip_session',
    description:
      'Mark ONE specific scheduled session as skipped. Use when there are multiple sessions on the ' +
      'same day and the user wants to skip just one. Pass the session id from get_schedule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scheduled_id: { type: 'string', description: 'Scheduled session id from get_schedule' },
      },
      required: ['scheduled_id'],
    },
  },
  {
    name: 'reschedule_session',
    description:
      'Move a scheduled session to a different date. Pass the session id from get_schedule and ' +
      'the target date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scheduled_id: { type: 'string', description: 'Scheduled session id from get_schedule' },
        new_date: { type: 'string', description: 'Target ISO date YYYY-MM-DD' },
      },
      required: ['scheduled_id', 'new_date'],
    },
  },
  {
    name: 'swap_workout',
    description:
      'Replace the workout on a scheduled session. Either bind it to a workout from the user\'s ' +
      'library (workout_id) or describe a new ad-hoc session (template). Pass the session id from get_schedule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scheduled_id: { type: 'string', description: 'Scheduled session id from get_schedule' },
        workout_id: { type: 'string', description: 'Library workout id (preferred when a fitting one exists)' },
        template: {
          type: 'object',
          description: 'Ad-hoc session description (use when no library workout fits)',
          properties: {
            name: { type: 'string' },
            duration_min: { type: 'number' },
            intensity: { type: 'string', enum: ['easy', 'moderate', 'hard'] },
            notes: { type: 'string' },
          },
          required: ['name'],
        },
      },
      required: ['scheduled_id'],
    },
  },
] as const;

export type CoachToolName = (typeof COACH_TOOLS)[number]['name'];

// ── Dispatcher ─────────────────────────────────────────────────────────

export type ToolResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SCHEDULE_RANGE_DAYS = 400;
const MAX_SCHEDULE_RESULTS = 200;
const MAX_TEMPLATE_NAME_CHARS = 100;
const MAX_TEMPLATE_NOTES_CHARS = 500;
const MAX_DURATION_MIN = 600;
const MAX_RESCHEDULE_DAYS = 365;

// Strict ISO date — rejects calendar-invalid dates like 2026-02-30 even though
// they pass the structural regex.
function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export async function executeCoachTool(
  userId: string,
  name: string,
  input: unknown,
): Promise<ToolResult> {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Invalid input shape' };
  }
  const args = input as Record<string, unknown>;

  switch (name) {
    case 'get_schedule':
      return getSchedule(userId, args);
    case 'mark_rest_day':
      return markRestDay(userId, args);
    case 'skip_session':
      return skipSession(userId, args);
    case 'reschedule_session':
      return rescheduleSession(userId, args);
    case 'swap_workout':
      return swapWorkout(userId, args);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

// ── Tool implementations ───────────────────────────────────────────────

async function getSchedule(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (!isValidIsoDate(args.from)) return { ok: false, error: '`from` must be an ISO date YYYY-MM-DD' };
  if (!isValidIsoDate(args.to)) return { ok: false, error: '`to` must be an ISO date YYYY-MM-DD' };
  const from = args.from;
  const to = args.to;
  if (to < from) return { ok: false, error: '`to` must be on or after `from`' };
  const dayDiff = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000;
  if (dayDiff > MAX_SCHEDULE_RANGE_DAYS) {
    return { ok: false, error: `Range too wide (${dayDiff} days). Max ${MAX_SCHEDULE_RANGE_DAYS}.` };
  }

  const readResult = await readState(userId);
  if (!readResult) return { ok: true, result: { sessions: [], count: 0, note: 'No LH Fitness state for this user.' } };
  const { state } = readResult;

  const workoutById = new Map<string, string>();
  for (const w of state.workouts ?? []) {
    if (w?.id && typeof w.name === 'string') workoutById.set(w.id, w.name);
  }
  const planById = new Map<string, string>();
  for (const p of state.plans ?? []) {
    if (p?.id && typeof p.name === 'string') planById.set(p.id, p.name);
  }

  const allMatching = (state.scheduled_sessions ?? [])
    .filter((s) => typeof s?.date === 'string' && s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const truncated = allMatching.length > MAX_SCHEDULE_RESULTS;
  const sessions = (truncated ? allMatching.slice(0, MAX_SCHEDULE_RESULTS) : allMatching).map((s) => ({
    id: s.id,
    date: s.date,
    status: s.status,
    workout_name: s.workout_id ? workoutById.get(s.workout_id) : undefined,
    plan_name: s.plan_id ? planById.get(s.plan_id) : undefined,
    ai_template: s.ai_template,
  }));

  const counts = { scheduled: 0, completed: 0, skipped: 0, rescheduled: 0 };
  for (const s of allMatching) {
    if (s.status in counts) counts[s.status as keyof typeof counts]++;
  }

  return {
    ok: true,
    result: {
      sessions,
      count: sessions.length,
      total_in_range: allMatching.length,
      counts,
      truncated: truncated || undefined,
    },
  };
}

async function markRestDay(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (!isValidIsoDate(args.date)) return { ok: false, error: '`date` must be an ISO date YYYY-MM-DD' };
  const date = args.date;

  const readResult = await readState(userId);
  if (!readResult) return { ok: false, error: 'No LH Fitness state for this user.' };
  const { state, updatedAt } = readResult;

  const workoutById = new Map<string, string>();
  for (const w of state.workouts ?? []) {
    if (w?.id && typeof w.name === 'string') workoutById.set(w.id, w.name);
  }

  // Only flip 'scheduled' sessions — never overwrite 'completed' (data integrity)
  // and never re-flip 'skipped' (idempotent).
  const flippable = (state.scheduled_sessions ?? []).filter(
    (s) => s.date === date && s.status === 'scheduled',
  );
  if (flippable.length === 0) {
    const present = (state.scheduled_sessions ?? []).filter((s) => s.date === date);
    const note = present.length === 0
      ? 'No scheduled sessions on that date — nothing to skip.'
      : present.every(s => s.status === 'skipped')
        ? 'Already a rest day.'
        : 'Sessions on that date are already completed — preserved.';
    return { ok: true, result: { date, skipped_count: 0, note } };
  }

  const updated: FitnessState = {
    ...state,
    scheduled_sessions: state.scheduled_sessions.map((s) =>
      s.date === date && s.status === 'scheduled' ? { ...s, status: 'skipped' as ScheduledStatus } : s,
    ),
  };
  const writeResult = await writeState(userId, updated, updatedAt);
  if (!writeResult.ok) return writeResult;

  return {
    ok: true,
    result: {
      date,
      skipped_count: flippable.length,
      skipped_titles: flippable.map((s) => describeSession(s, workoutById)),
    },
  };
}

async function skipSession(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const scheduledId = args.scheduled_id;
  if (typeof scheduledId !== 'string' || !scheduledId) {
    return { ok: false, error: '`scheduled_id` is required' };
  }

  const readResult = await readState(userId);
  if (!readResult) return { ok: false, error: 'No LH Fitness state for this user.' };
  const { state, updatedAt } = readResult;

  const target = (state.scheduled_sessions ?? []).find((s) => s.id === scheduledId);
  if (!target) return { ok: false, error: `No scheduled session with that id` };
  if (target.status === 'skipped') {
    return { ok: true, result: { id: scheduledId, note: 'Already skipped.' } };
  }
  if (target.status === 'completed') {
    return { ok: false, error: 'Session is already completed — cannot skip retroactively.' };
  }

  const updated: FitnessState = {
    ...state,
    scheduled_sessions: state.scheduled_sessions.map((s) =>
      s.id === scheduledId ? { ...s, status: 'skipped' as ScheduledStatus } : s,
    ),
  };
  const writeResult = await writeState(userId, updated, updatedAt);
  if (!writeResult.ok) return writeResult;

  const workoutById = new Map<string, string>();
  for (const w of state.workouts ?? []) {
    if (w?.id && typeof w.name === 'string') workoutById.set(w.id, w.name);
  }

  return {
    ok: true,
    result: {
      id: scheduledId,
      date: target.date,
      title: describeSession(target, workoutById),
    },
  };
}

async function rescheduleSession(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const scheduledId = args.scheduled_id;
  if (typeof scheduledId !== 'string' || !scheduledId) {
    return { ok: false, error: '`scheduled_id` is required' };
  }
  if (!isValidIsoDate(args.new_date)) {
    return { ok: false, error: '`new_date` must be an ISO date YYYY-MM-DD' };
  }
  const newDate = args.new_date;

  // Bound the reschedule window — sanity guard against the model being
  // tricked into moving sessions to 1970 or 9999. UTC-anchored for the
  // boundary; with a ±365-day window the off-by-one across a SAST/UTC
  // midnight is irrelevant.
  const today = new Date().toISOString().slice(0, 10);
  const dayDiff = Math.abs((new Date(`${newDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  if (dayDiff > MAX_RESCHEDULE_DAYS) {
    return { ok: false, error: `Target date too far from today (${Math.round(dayDiff)} days). Max ${MAX_RESCHEDULE_DAYS}.` };
  }

  const readResult = await readState(userId);
  if (!readResult) return { ok: false, error: 'No LH Fitness state for this user.' };
  const { state, updatedAt } = readResult;

  const target = (state.scheduled_sessions ?? []).find((s) => s.id === scheduledId);
  if (!target) return { ok: false, error: `No scheduled session with that id` };
  if (target.status === 'completed') {
    return { ok: false, error: 'Session is already completed — cannot reschedule retroactively.' };
  }
  const oldDate = target.date;
  const collisionCount = (state.scheduled_sessions ?? []).filter(
    (s) => s.id !== scheduledId && s.date === newDate && s.status === 'scheduled',
  ).length;

  const updated: FitnessState = {
    ...state,
    scheduled_sessions: state.scheduled_sessions.map((s) =>
      s.id === scheduledId ? { ...s, date: newDate, status: 'scheduled' as ScheduledStatus } : s,
    ),
  };
  const writeResult = await writeState(userId, updated, updatedAt);
  if (!writeResult.ok) return writeResult;

  const workoutById = new Map<string, string>();
  for (const w of state.workouts ?? []) {
    if (w?.id && typeof w.name === 'string') workoutById.set(w.id, w.name);
  }

  return {
    ok: true,
    result: {
      id: scheduledId,
      from_date: oldDate,
      to_date: newDate,
      title: describeSession(target, workoutById),
      sessions_already_on_target_date: collisionCount,
    },
  };
}

async function swapWorkout(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const scheduledId = args.scheduled_id;
  const workoutId = typeof args.workout_id === 'string' && args.workout_id.trim() !== '' ? args.workout_id : undefined;
  const template = args.template && typeof args.template === 'object' && !Array.isArray(args.template)
    ? (args.template as Record<string, unknown>)
    : undefined;

  if (typeof scheduledId !== 'string' || !scheduledId) {
    return { ok: false, error: '`scheduled_id` is required' };
  }
  if (!workoutId && !template) {
    return { ok: false, error: 'Provide either `workout_id` or `template`' };
  }
  if (workoutId && template) {
    return { ok: false, error: 'Provide either `workout_id` OR `template`, not both' };
  }

  const readResult = await readState(userId);
  if (!readResult) return { ok: false, error: 'No LH Fitness state for this user.' };
  const { state, updatedAt } = readResult;

  const target = (state.scheduled_sessions ?? []).find((s) => s.id === scheduledId);
  if (!target) return { ok: false, error: `No scheduled session with that id` };
  if (target.status === 'completed') {
    return { ok: false, error: 'Session is already completed — cannot swap retroactively.' };
  }

  if (workoutId) {
    const workout = (state.workouts ?? []).find((w) => w.id === workoutId);
    if (!workout) return { ok: false, error: `No workout with that id in the library` };
  }

  const templateClean = template ? sanitizeTemplate(template) : undefined;
  if (template && !templateClean) {
    return { ok: false, error: '`template` must include at least { name }' };
  }

  const updated: FitnessState = {
    ...state,
    scheduled_sessions: state.scheduled_sessions.map((s) =>
      s.id === scheduledId
        ? {
            ...s,
            workout_id: workoutId ?? undefined,
            ai_template: templateClean ?? undefined,
            status: 'scheduled' as ScheduledStatus,
          }
        : s,
    ),
  };
  const writeResult = await writeState(userId, updated, updatedAt);
  if (!writeResult.ok) return writeResult;

  const workoutById = new Map<string, Workout>();
  for (const w of state.workouts ?? []) {
    if (w?.id) workoutById.set(w.id, w);
  }

  const boundTo = workoutId
    ? { kind: 'library' as const, name: workoutById.get(workoutId)?.name ?? 'workout' }
    : { kind: 'template' as const, name: templateClean!.name, duration_min: templateClean!.duration_min };

  return {
    ok: true,
    result: {
      id: scheduledId,
      date: target.date,
      bound_to: boundTo,
    },
  };
}

// ── Storage helpers ─────────────────────────────────────────────────────

interface ReadResult {
  state: FitnessState;
  updatedAt: string | null;
}

async function readState(userId: string): Promise<ReadResult | null> {
  const { data, error } = await supabaseAdmin
    .from('lhfitness_state')
    .select('state, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  const state = data.state as FitnessState | null;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  return { state, updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null };
}

// Optimistic concurrency control. If `priorUpdatedAt` is provided, we only
// write when the row's updated_at still matches — i.e. nothing wrote between
// our read and write. On conflict we surface a clear error so the model can
// re-read and retry. This protects against the lost-update race vs the
// debounced client PUT.
async function writeState(
  userId: string,
  state: FitnessState,
  priorUpdatedAt: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const newUpdatedAt = new Date().toISOString();

  if (priorUpdatedAt) {
    const { data, error } = await supabaseAdmin
      .from('lhfitness_state')
      .update({ state, updated_at: newUpdatedAt })
      .eq('user_id', userId)
      .eq('updated_at', priorUpdatedAt)
      .select('user_id')
      .maybeSingle();

    if (error) return { ok: false, error: 'Could not write fitness state.' };
    if (!data) {
      return {
        ok: false,
        error: 'State changed concurrently — try again in a moment.',
      };
    }
    return { ok: true };
  }

  // No prior version — first write. Use upsert.
  const { error } = await supabaseAdmin.from('lhfitness_state').upsert(
    { user_id: userId, state, updated_at: newUpdatedAt },
    { onConflict: 'user_id' },
  );
  if (error) return { ok: false, error: 'Could not write fitness state.' };
  return { ok: true };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function describeSession(s: ScheduledSession, workoutById: Map<string, string>): string {
  if (s.workout_id && workoutById.has(s.workout_id)) return workoutById.get(s.workout_id)!;
  if (s.ai_template?.name) return s.ai_template.name;
  return 'Training session';
}

function sanitizeTemplate(t: Record<string, unknown>): NonNullable<ScheduledSession['ai_template']> | null {
  // Cap user-controlled strings to block prompt-injection persistence
  // (template name flows back into the model's context on every future turn).
  const rawName = typeof t.name === 'string' ? t.name.trim() : '';
  if (!rawName) return null;
  const name = rawName.slice(0, MAX_TEMPLATE_NAME_CHARS);

  const intensity: 'easy' | 'moderate' | 'hard' | undefined =
    t.intensity === 'easy' || t.intensity === 'moderate' || t.intensity === 'hard' ? t.intensity : undefined;

  // Reject negative / non-finite / unreasonable durations.
  const durationMin =
    typeof t.duration_min === 'number' && Number.isFinite(t.duration_min) && t.duration_min > 0 && t.duration_min <= MAX_DURATION_MIN
      ? Math.round(t.duration_min)
      : undefined;

  const rawNotes = typeof t.notes === 'string' ? t.notes.trim() : '';
  const notes = rawNotes ? rawNotes.slice(0, MAX_TEMPLATE_NOTES_CHARS) : undefined;

  return { name, duration_min: durationMin, intensity, notes };
}
