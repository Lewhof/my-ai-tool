import { supabaseAdmin } from '@/lib/supabase-server';
import type { CalendarEvent } from '@/lib/calendar-events';

// Read-only bridge that projects LH Fitness scheduled sessions out of the
// lhfitness_state JSONB blob into the dashboard's unified CalendarEvent shape.
//
// LH Fitness is the source of truth — it persists state in localStorage and
// mirrors to lhfitness_state. The dashboard never writes back; it just reads
// the same blob the LH Fitness app produces.

const DEFAULT_HOUR_SAST = 18;       // 18:00 SAST is the default training slot
const DEFAULT_DURATION_MIN = 60;
const COMPLETED_LOOKBACK_DAYS = 7;  // show ✓-prefixed completed sessions for the last week

interface ScheduledSessionRow {
  id?: unknown;
  date?: unknown;
  status?: unknown;
  ai_template?: { name?: unknown; duration_min?: unknown } | null | undefined;
  workout_id?: unknown;
  completed_session_id?: unknown;
}

interface FitnessStateBlob {
  scheduled_sessions?: ScheduledSessionRow[];
  workouts?: Array<{ id?: unknown; name?: unknown; duration_min?: unknown }>;
  sessions?: Array<{ id?: unknown; ended_at?: unknown; workout_name?: unknown }>;
}

/**
 * Read the user's LH Fitness scheduled sessions and project them into the
 * unified CalendarEvent shape, filtered to [startIso, endIso].
 *
 * Tolerates a missing row, malformed JSONB, missing fields, and partial sync —
 * any failure path returns an empty array so calendar/planner stay alive.
 */
export async function fetchFitnessSessions(
  userId: string,
  startIso: string,
  endIso: string,
): Promise<CalendarEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('lhfitness_state')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return [];

  const state = data.state as FitnessStateBlob | null;
  if (!state || !Array.isArray(state.scheduled_sessions)) return [];

  const workoutById = new Map<string, { name?: string; duration_min?: number }>();
  if (Array.isArray(state.workouts)) {
    for (const w of state.workouts) {
      if (typeof w?.id === 'string') {
        workoutById.set(w.id, {
          name: typeof w.name === 'string' ? w.name : undefined,
          duration_min: typeof w.duration_min === 'number' ? w.duration_min : undefined,
        });
      }
    }
  }

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];

  const completedCutoffMs = Date.now() - COMPLETED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  const events: CalendarEvent[] = [];

  for (const row of state.scheduled_sessions) {
    if (!row || typeof row.id !== 'string' || typeof row.date !== 'string') continue;

    // Skip skipped + rescheduled — skipped won't happen, rescheduled is replaced
    // by its successor row already in the array.
    const status = row.status;
    if (status === 'skipped' || status === 'rescheduled') continue;

    const start = sastDateTime(row.date, DEFAULT_HOUR_SAST);
    if (!start) continue;
    const startMsRow = new Date(start).getTime();

    // Window filter — for completed sessions, also gate against the lookback
    // window so we don't drag the entire training history into every calendar
    // fetch.
    if (startMsRow < startMs || startMsRow > endMs) continue;
    if (status === 'completed' && startMsRow < completedCutoffMs) continue;

    const workout = typeof row.workout_id === 'string' ? workoutById.get(row.workout_id) : undefined;
    const templateName = typeof row.ai_template?.name === 'string' ? row.ai_template.name : undefined;
    const templateDur = typeof row.ai_template?.duration_min === 'number' ? row.ai_template.duration_min : undefined;

    const baseTitle = workout?.name || templateName || 'Training session';
    const subject = status === 'completed' ? `✓ ${baseTitle}` : baseTitle;
    const durationMin = templateDur ?? workout?.duration_min ?? DEFAULT_DURATION_MIN;

    const end = addMinutesIso(start, durationMin);

    events.push({
      id: `lhfitness:${row.id}`,
      subject,
      start,
      end,
      accountId: 'lhfitness',
      accountLabel: 'LH Fitness',
      provider: 'lhfitness',
    });
  }

  return events;
}

/**
 * Read completed sessions from today's date window for the /today change feed.
 * Returns rows shaped for ChangeItem injection — kind/href filled by the caller.
 */
export interface FitnessCompletion {
  scheduled_id: string;
  title: string;
  at: string;        // ISO
}

export async function fetchCompletedSessionsToday(
  userId: string,
  startOfDayIso: string,
): Promise<FitnessCompletion[]> {
  const { data, error } = await supabaseAdmin
    .from('lhfitness_state')
    .select('state, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return [];

  const state = data.state as FitnessStateBlob | null;
  if (!state || !Array.isArray(state.scheduled_sessions)) return [];

  const sessionsById = new Map<string, { ended_at?: string; workout_name?: string }>();
  if (Array.isArray(state.sessions)) {
    for (const s of state.sessions) {
      if (typeof s?.id === 'string') {
        sessionsById.set(s.id, {
          ended_at: typeof s.ended_at === 'string' ? s.ended_at : undefined,
          workout_name: typeof s.workout_name === 'string' ? s.workout_name : undefined,
        });
      }
    }
  }

  const workoutById = new Map<string, string>();
  if (Array.isArray(state.workouts)) {
    for (const w of state.workouts) {
      if (typeof w?.id === 'string' && typeof w.name === 'string') workoutById.set(w.id, w.name);
    }
  }

  const startMs = new Date(startOfDayIso).getTime();
  const out: FitnessCompletion[] = [];

  for (const row of state.scheduled_sessions) {
    if (row?.status !== 'completed') continue;
    if (typeof row.id !== 'string') continue;

    const linkedSession = typeof row.completed_session_id === 'string' ? sessionsById.get(row.completed_session_id) : undefined;
    // Prefer the actual end timestamp; if the live-log session crashed
    // mid-rep, fall back to the schedule's SAST date — never to started_at,
    // because a started-but-not-ended session has no completion timestamp.
    const completedAt = linkedSession?.ended_at
      || sastDateTime(typeof row.date === 'string' ? row.date : '', DEFAULT_HOUR_SAST);
    if (!completedAt) continue;
    const completedMs = new Date(completedAt).getTime();
    if (!Number.isFinite(completedMs) || completedMs < startMs) continue;

    const workoutId = typeof row.workout_id === 'string' ? row.workout_id : undefined;
    const title = linkedSession?.workout_name
      || (workoutId ? workoutById.get(workoutId) : undefined)
      || (typeof row.ai_template?.name === 'string' ? row.ai_template.name : undefined)
      || 'Training session';

    out.push({ scheduled_id: row.id, title, at: completedAt });
  }

  return out;
}

// ── helpers ──

/**
 * Build an ISO datetime in SAST (+02:00) from a YYYY-MM-DD date.
 * SAST has no DST, so the offset is always +02:00.
 */
function sastDateTime(dateOnly: string, hour: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  const hh = String(hour).padStart(2, '0');
  return `${dateOnly}T${hh}:00:00+02:00`;
}

function addMinutesIso(iso: string, minutes: number): string {
  const ms = new Date(iso).getTime() + minutes * 60 * 1000;
  return new Date(ms).toISOString();
}
