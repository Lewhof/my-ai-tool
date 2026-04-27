'use client';

import { useEffect, useState, useCallback } from 'react';
import type {
  FitnessState, Profile, Workout, Session, BodyMetric, PersonalRecord,
  CoachMessage, CoachThread, CoachMode, LoggedExercise, LoggedSet,
  TrainingPlan, ScheduledSession, ImportedWorkout, ScheduledStatus,
} from './types';
import { SEED_WORKOUTS } from './seed';

const STORAGE_KEY = 'lhfitness:v1';
const STORAGE_TS_KEY = 'lhfitness:v1:updated_at';
const SERVER_SYNC_DEBOUNCE_MS = 1500;

const EMPTY_STATE: FitnessState = {
  profile: null,
  workouts: [],
  sessions: [],
  body_metrics: [],
  prs: [],
  coach_threads: [],
  active_thread_id: null,
  plans: [],
  scheduled_sessions: [],
  imported_workouts: [],
};

function loadState(): FitnessState {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    type LegacyProfile = FitnessState['profile'] & { goal?: import('./types').Goal };
    const parsed = JSON.parse(raw) as Omit<FitnessState, 'profile'> & {
      profile?: LegacyProfile;
      coach_messages?: CoachMessage[];
    };
    // Migration: legacy single `goal` field → `goals` array
    if (parsed.profile && !parsed.profile.goals && parsed.profile.goal) {
      parsed.profile.goals = [parsed.profile.goal];
    }
    // Migration: flat coach_messages → first thread
    if (!parsed.coach_threads && parsed.coach_messages && parsed.coach_messages.length > 0) {
      const now = new Date().toISOString();
      parsed.coach_threads = [{
        id: 'thread-legacy-' + Date.now(),
        title: 'Previous chat',
        mode: 'quick',
        messages: parsed.coach_messages,
        created_at: parsed.coach_messages[0]?.created_at ?? now,
        updated_at: now,
      }];
    }
    return { ...EMPTY_STATE, ...parsed } as FitnessState;
  } catch {
    return EMPTY_STATE;
  }
}

function saveState(state: FitnessState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.localStorage.setItem(STORAGE_TS_KEY, new Date().toISOString());
  } catch {
    /* quota or private mode — ignore */
  }
}

function getLocalUpdatedAt(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(STORAGE_TS_KEY); } catch { return null; }
}

// Pull a server snapshot. Returns null on no-server-row or any failure
// — callers must treat absence as "no remote yet, use local".
async function fetchServerState(): Promise<{ state: FitnessState; updated_at: string } | null> {
  try {
    const res = await fetch('/api/lhfitness/state', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as { state: FitnessState | null; updated_at: string | null };
    if (!data.state || !data.updated_at) return null;
    return { state: data.state, updated_at: data.updated_at };
  } catch {
    return null;
  }
}

// Fire-and-forget upsert to the server. Quietly fails — local stays
// authoritative until the next successful sync.
async function pushServerState(state: FitnessState): Promise<void> {
  try {
    await fetch('/api/lhfitness/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
  } catch {
    /* best-effort — next mutation will retry */
  }
}

// Cross-tab + cross-component sync via a custom event
const SYNC_EVENT = 'lhfitness:sync';

function emitSync() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function useFitnessState() {
  const [state, setState] = useState<FitnessState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
    const onSync = () => setState(loadState());
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  const update = useCallback((mutator: (s: FitnessState) => FitnessState) => {
    setState((prev) => {
      const next = mutator(prev);
      saveState(next);
      // Defer the broadcast so other listeners pick up the new value
      setTimeout(emitSync, 0);
      return next;
    });
  }, []);

  return { state, update, hydrated };
}

// ── Convenience mutators ──────────────────────────────────────────────

export function setProfile(profile: Profile, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => {
    // First-time setup: seed the workout library based on available equipment
    const next = { ...s, profile };
    if (s.workouts.length === 0) {
      const userEquipment = new Set(profile.available_equipment);
      // Show curated workouts that the user can actually do (or fall back to all)
      const filtered = SEED_WORKOUTS.filter(w =>
        w.equipment.every(e => userEquipment.has(e) || e === 'bodyweight')
      );
      next.workouts = (filtered.length >= 6 ? filtered : SEED_WORKOUTS);
    }
    return next;
  });
}

export function addWorkout(workout: Workout, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({ ...s, workouts: [workout, ...s.workouts] }));
}

export function deleteWorkout(id: string, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({ ...s, workouts: s.workouts.filter(w => w.id !== id) }));
}

export function startSession(workout: Workout): Session {
  return {
    id: 'sess-' + Date.now(),
    workout_id: workout.id,
    workout_name: workout.name,
    started_at: new Date().toISOString(),
    exercises: workout.exercises.map<LoggedExercise>(ex => ({
      exercise_id: ex.id,
      exercise_name: ex.name,
      sets: Array.from({ length: ex.sets }, () => ({ completed: false } as LoggedSet)),
    })),
  };
}

export function finishSession(
  session: Session,
  rating: number | undefined,
  notes: string | undefined,
  update: (m: (s: FitnessState) => FitnessState) => void
) {
  const ended_at = new Date().toISOString();
  const duration_seconds = Math.round((new Date(ended_at).getTime() - new Date(session.started_at).getTime()) / 1000);
  const total_volume_kg = session.exercises.reduce((tot, ex) => {
    return tot + ex.sets.reduce((s, set) => s + (set.completed ? (set.reps || 0) * (set.weight_kg || 0) : 0), 0);
  }, 0);
  const finished: Session = { ...session, ended_at, duration_seconds, total_volume_kg, rating, notes };

  update((s) => {
    // Update PRs based on this session
    const newPrs = computeNewPRs(finished, s.prs);
    return {
      ...s,
      sessions: [finished, ...s.sessions],
      prs: mergePRs(s.prs, newPrs),
    };
  });

  return finished;
}

function computeNewPRs(session: Session, existing: PersonalRecord[]): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  for (const ex of session.exercises) {
    const completed = ex.sets.filter(s => s.completed);
    if (completed.length === 0) continue;

    // Max weight
    const maxWeightSet = completed.reduce<LoggedSet | null>((acc, set) => {
      if (set.weight_kg && set.weight_kg > 0 && (!acc || (acc.weight_kg || 0) < set.weight_kg)) return set;
      return acc;
    }, null);
    if (maxWeightSet?.weight_kg) {
      const prev = existing.find(p => p.exercise_id === ex.exercise_id && p.type === 'max_weight');
      if (!prev || prev.value < maxWeightSet.weight_kg) {
        out.push({
          exercise_id: ex.exercise_id, exercise_name: ex.exercise_name,
          type: 'max_weight', value: maxWeightSet.weight_kg, unit: 'kg',
          date: session.started_at, session_id: session.id,
        });
      }
    }

    // Max reps (single set)
    const maxRepsSet = completed.reduce<LoggedSet | null>((acc, set) => {
      if (set.reps && set.reps > 0 && (!acc || (acc.reps || 0) < set.reps)) return set;
      return acc;
    }, null);
    if (maxRepsSet?.reps && (!maxRepsSet.weight_kg || maxRepsSet.weight_kg < 5)) {
      const prev = existing.find(p => p.exercise_id === ex.exercise_id && p.type === 'max_reps');
      if (!prev || prev.value < maxRepsSet.reps) {
        out.push({
          exercise_id: ex.exercise_id, exercise_name: ex.exercise_name,
          type: 'max_reps', value: maxRepsSet.reps, unit: 'reps',
          date: session.started_at, session_id: session.id,
        });
      }
    }

    // Max volume (single exercise)
    const volume = completed.reduce((s, set) => s + (set.reps || 0) * (set.weight_kg || 0), 0);
    if (volume > 0) {
      const prev = existing.find(p => p.exercise_id === ex.exercise_id && p.type === 'max_volume');
      if (!prev || prev.value < volume) {
        out.push({
          exercise_id: ex.exercise_id, exercise_name: ex.exercise_name,
          type: 'max_volume', value: Math.round(volume), unit: 'kg*reps',
          date: session.started_at, session_id: session.id,
        });
      }
    }
  }
  return out;
}

function mergePRs(existing: PersonalRecord[], next: PersonalRecord[]): PersonalRecord[] {
  const map = new Map<string, PersonalRecord>();
  for (const p of existing) map.set(p.exercise_id + ':' + p.type, p);
  for (const p of next) map.set(p.exercise_id + ':' + p.type, p);
  return Array.from(map.values());
}

export function logBodyMetric(metric: BodyMetric, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => {
    // Replace if same date already exists
    const filtered = s.body_metrics.filter(b => b.date !== metric.date);
    return { ...s, body_metrics: [...filtered, metric].sort((a, b) => a.date.localeCompare(b.date)) };
  });
}

// ── Coach threads (level-up) ─────────────────────────────────────────

export function newThread(mode: CoachMode, update: (m: (s: FitnessState) => FitnessState) => void): CoachThread {
  const t: CoachThread = {
    id: 'thread-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    title: 'New conversation',
    mode,
    messages: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  update((s) => ({
    ...s,
    coach_threads: [t, ...s.coach_threads],
    active_thread_id: t.id,
  }));
  return t;
}

export function setActiveThread(id: string | null, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({ ...s, active_thread_id: id }));
}

export function appendThreadMessage(threadId: string, msg: CoachMessage, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({
    ...s,
    coach_threads: s.coach_threads.map(t =>
      t.id === threadId
        ? {
            ...t,
            messages: [...t.messages, msg],
            updated_at: new Date().toISOString(),
            // Auto-name from first user message
            title: t.messages.length === 0 && msg.role === 'user'
              ? msg.content.slice(0, 60) + (msg.content.length > 60 ? '…' : '')
              : t.title,
          }
        : t
    ),
  }));
}

export function setThreadPlan(threadId: string, planId: string, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({
    ...s,
    coach_threads: s.coach_threads.map(t =>
      t.id === threadId ? { ...t, resulting_plan_id: planId, updated_at: new Date().toISOString() } : t
    ),
  }));
}

export function deleteThread(id: string, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({
    ...s,
    coach_threads: s.coach_threads.filter(t => t.id !== id),
    active_thread_id: s.active_thread_id === id ? null : s.active_thread_id,
  }));
}

// ── Training plans + scheduled sessions ───────────────────────────────

export function commitPlan(
  plan: TrainingPlan,
  update: (m: (s: FitnessState) => FitnessState) => void
): { plan: TrainingPlan; scheduled: ScheduledSession[] } {
  const startsOn = new Date(plan.starts_on);
  const scheduled: ScheduledSession[] = [];
  plan.weeks.forEach(week => {
    week.days.forEach(day => {
      if (day.type === 'rest') return;
      const date = new Date(startsOn);
      date.setDate(startsOn.getDate() + (week.week_num - 1) * 7 + day.day_offset);
      scheduled.push({
        id: `sched-${plan.id}-${week.week_num}-${day.day_offset}`,
        date: date.toISOString().slice(0, 10),
        plan_id: plan.id,
        plan_week_num: week.week_num,
        plan_day_offset: day.day_offset,
        workout_id: day.workout_id,
        ai_template: day.template,
        status: 'scheduled',
        created_at: new Date().toISOString(),
      });
    });
  });

  update((s) => ({
    ...s,
    // Deactivate other plans (only one active at a time)
    plans: [{ ...plan, active: true }, ...s.plans.map(p => ({ ...p, active: false }))],
    // Remove any prior scheduled sessions belonging to a deactivated plan that hadn't started yet
    scheduled_sessions: [
      ...s.scheduled_sessions.filter(ss =>
        ss.status === 'completed' ||
        ss.status === 'skipped' ||
        new Date(ss.date).getTime() < Date.now() - 24 * 60 * 60 * 1000
      ),
      ...scheduled,
    ],
  }));

  return { plan, scheduled };
}

export function deletePlan(id: string, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({
    ...s,
    plans: s.plans.filter(p => p.id !== id),
    scheduled_sessions: s.scheduled_sessions.filter(ss => ss.plan_id !== id || ss.status === 'completed'),
  }));
}

export function setActivePlan(id: string, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({
    ...s,
    plans: s.plans.map(p => ({ ...p, active: p.id === id })),
  }));
}

export function updateScheduledStatus(
  id: string,
  patch: Partial<Pick<ScheduledSession, 'status' | 'completed_session_id' | 'rescheduled_to' | 'workout_id' | 'notes'>>,
  update: (m: (s: FitnessState) => FitnessState) => void
) {
  update((s) => ({
    ...s,
    scheduled_sessions: s.scheduled_sessions.map(ss => ss.id === id ? { ...ss, ...patch } : ss),
  }));
}

export function rescheduleSession(
  id: string,
  newDate: string,
  update: (m: (s: FitnessState) => FitnessState) => void
) {
  update((s) => ({
    ...s,
    scheduled_sessions: s.scheduled_sessions.map(ss =>
      ss.id === id ? { ...ss, date: newDate, status: 'scheduled' as ScheduledStatus } : ss
    ),
  }));
}

export function manualScheduleSession(
  date: string,
  workoutId: string | undefined,
  update: (m: (s: FitnessState) => FitnessState) => void
) {
  const ss: ScheduledSession = {
    id: 'sched-manual-' + Date.now(),
    date,
    workout_id: workoutId,
    status: 'scheduled',
    created_at: new Date().toISOString(),
  };
  update((s) => ({
    ...s,
    scheduled_sessions: [...s.scheduled_sessions, ss],
  }));
  return ss;
}

// ── Imported workouts (Garmin / external) ─────────────────────────────

// Granular dedupe: same start time (minute precision) + same duration (within 60s) = duplicate
export function isDuplicate(candidate: ImportedWorkout, existing: ImportedWorkout[]): ImportedWorkout | null {
  if (candidate.external_id) {
    const byId = existing.find(e => e.external_id && e.external_id === candidate.external_id);
    if (byId) return byId;
  }
  const candTime = new Date(candidate.date).getTime();
  return existing.find(e => {
    const eTime = new Date(e.date).getTime();
    const timeDiff = Math.abs(candTime - eTime);
    if (timeDiff > 60_000) return false;
    if (candidate.duration_seconds && e.duration_seconds) {
      if (Math.abs(candidate.duration_seconds - e.duration_seconds) > 60) return false;
    }
    return true;
  }) || null;
}

export function appendImports(imports: ImportedWorkout[], update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({
    ...s,
    imported_workouts: [...imports, ...s.imported_workouts]
      .sort((a, b) => b.date.localeCompare(a.date)),
  }));
}

export function deleteImport(id: string, update: (m: (s: FitnessState) => FitnessState) => void) {
  update((s) => ({
    ...s,
    imported_workouts: s.imported_workouts.filter(i => i.id !== id),
  }));
}

// ── Helpers for views ─────────────────────────────────────────────────

export function getActivePlan(state: FitnessState): TrainingPlan | undefined {
  return state.plans.find(p => p.active);
}

export function getScheduledForDate(state: FitnessState, date: string): ScheduledSession[] {
  return state.scheduled_sessions.filter(ss => ss.date === date);
}

export function getScheduledTodayOrNext(state: FitnessState): ScheduledSession | undefined {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = state.scheduled_sessions
    .filter(ss => ss.status === 'scheduled' && ss.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0];
}

// ── Training summary (for coach personalisation) ──────────────────────

export interface TrainingSummary {
  // Combined activity counts
  last_7d_total: number;
  last_30d_total: number;
  last_30d_by_type: Record<string, number>; // "Running": 8, "Strength Training": 12
  last_30d_running_km: number;
  last_30d_strength_volume_kg: number;
  last_30d_active_days: number;
  // Habit / recency
  longest_recent_gap_days: number;
  current_streak_days: number;
  // Specific recent activities (for direct citation by coach)
  most_recent_activities: Array<{
    date: string;
    kind: 'session' | 'import';
    name: string;
    duration_min?: number;
    distance_km?: number;
    volume_kg?: number;
    avg_hr?: number;
    rating?: number;
  }>;
  // Frequency signals
  median_running_distance_km?: number;
  weekly_target: number;
  weekly_target_pct: number; // % of target this week (sessions + imports)
}

function within(days: number, dateStr: string): boolean {
  const t = new Date(dateStr).getTime();
  return Date.now() - t < days * 86400000;
}

export function buildTrainingSummary(state: FitnessState): TrainingSummary {
  const sessions = state.sessions;
  const imports = state.imported_workouts;
  const target = state.profile?.weekly_target ?? 4;

  // Running-type matcher (covers Running, Trail Run, Easy Run, etc.)
  const isRunning = (type: string) => /run|jog/i.test(type);
  const isCycling = (type: string) => /cycl|bike|ride/i.test(type);
  const isStrength = (type: string) => /strength|lift|gym|weight/i.test(type);

  // Last 7d / 30d activity counts (sessions + imports combined)
  const last7d_sessions = sessions.filter(s => within(7, s.started_at)).length;
  const last7d_imports = imports.filter(i => within(7, i.date)).length;
  const last30d_sessions = sessions.filter(s => within(30, s.started_at));
  const last30d_imports = imports.filter(i => within(30, i.date));

  // By type breakdown (uses session.workout_name as proxy, imports use type)
  const byType: Record<string, number> = {};
  last30d_sessions.forEach(s => {
    // Best-effort: map session workout_name to a category
    const n = s.workout_name.toLowerCase();
    const cat = isRunning(n) ? 'Running'
      : isCycling(n) ? 'Cycling'
      : 'Strength / gym';
    byType[cat] = (byType[cat] || 0) + 1;
  });
  last30d_imports.forEach(i => {
    byType[i.type] = (byType[i.type] || 0) + 1;
  });

  // Distance/volume aggregations
  const runs30d = last30d_imports.filter(i => isRunning(i.type) && i.distance_km);
  const last30d_running_km = runs30d.reduce((s, i) => s + (i.distance_km || 0), 0);
  const last30d_strength_volume_kg = last30d_sessions.reduce((s, sess) => s + (sess.total_volume_kg || 0), 0);

  // Active days (any activity)
  const activeDays = new Set<string>();
  last30d_sessions.forEach(s => activeDays.add(s.started_at.slice(0, 10)));
  last30d_imports.forEach(i => activeDays.add(i.date.slice(0, 10)));

  // Longest gap (within last 30 days)
  const sortedDays = Array.from(activeDays).sort();
  let longestGap = 0;
  for (let i = 1; i < sortedDays.length; i++) {
    const gap = (new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime()) / 86400000;
    if (gap - 1 > longestGap) longestGap = Math.floor(gap - 1);
  }

  // Current streak (using existing helper)
  const streak = streakDays(sessions);

  // Most recent activities (top 8, mixed sessions + imports, newest first)
  const sessionActivities = sessions.slice(0, 8).map(s => ({
    date: s.started_at,
    kind: 'session' as const,
    name: s.workout_name,
    duration_min: s.duration_seconds ? Math.round(s.duration_seconds / 60) : undefined,
    volume_kg: s.total_volume_kg,
    rating: s.rating,
  }));
  const importActivities = imports.slice(0, 8).map(i => ({
    date: i.date,
    kind: 'import' as const,
    name: i.name || i.type,
    duration_min: i.duration_seconds ? Math.round(i.duration_seconds / 60) : undefined,
    distance_km: i.distance_km,
    avg_hr: i.avg_hr,
  }));
  const mostRecent = [...sessionActivities, ...importActivities]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  // Median running distance (for pace/load context)
  let medianRunKm: number | undefined;
  if (runs30d.length > 0) {
    const sorted = runs30d.map(r => r.distance_km!).sort((a, b) => a - b);
    medianRunKm = sorted[Math.floor(sorted.length / 2)];
  }

  // Weekly target progress (combined sessions + imports this week)
  const weekTotal = last7d_sessions + last7d_imports;
  const targetPct = Math.min(100, Math.round((weekTotal / target) * 100));

  return {
    last_7d_total: weekTotal,
    last_30d_total: last30d_sessions.length + last30d_imports.length,
    last_30d_by_type: byType,
    last_30d_running_km: Math.round(last30d_running_km * 10) / 10,
    last_30d_strength_volume_kg: Math.round(last30d_strength_volume_kg),
    last_30d_active_days: activeDays.size,
    longest_recent_gap_days: longestGap,
    current_streak_days: streak,
    most_recent_activities: mostRecent,
    median_running_distance_km: medianRunKm ? Math.round(medianRunKm * 10) / 10 : undefined,
    weekly_target: target,
    weekly_target_pct: targetPct,
  };
}

// Auto-link imports to scheduled sessions on the same date when types match.
// Called after `appendImports` — examines newly-added imports + existing scheduled
// sessions and marks the scheduled session complete if a matching import lands on
// the same date. Cheap heuristic; user can always undo by manually flipping status.
export function autoLinkImports(
  newImports: ImportedWorkout[],
  update: (m: (s: FitnessState) => FitnessState) => void
): { linked: number } {
  let linked = 0;
  update((s) => {
    const importsByDate = new Map<string, ImportedWorkout[]>();
    newImports.forEach(i => {
      const d = i.date.slice(0, 10);
      const arr = importsByDate.get(d) ?? [];
      arr.push(i);
      importsByDate.set(d, arr);
    });

    const matchType = (importType: string, workoutText: string): boolean => {
      const it = importType.toLowerCase();
      const wt = workoutText.toLowerCase();
      if (/run|jog/.test(it) && /run|jog|tempo|interval|5k|10k|cardio/.test(wt)) return true;
      if (/cycl|bike|ride/.test(it) && /cycl|bike|ride|spin/.test(wt)) return true;
      if (/strength|lift|gym|weight/.test(it) && /(push|pull|leg|chest|back|shoulder|arm|squat|bench|dead|lift|strength|gym|hypertroph)/.test(wt)) return true;
      if (/yoga|stretch|mobility/.test(it) && /yoga|stretch|mobility|recovery/.test(wt)) return true;
      if (/swim/.test(it) && /swim/.test(wt)) return true;
      if (/walk|hike/.test(it) && /walk|hike/.test(wt)) return true;
      if (/hiit/.test(it) && /hiit|interval|burner/.test(wt)) return true;
      return false;
    };

    const nextScheduled = s.scheduled_sessions.map(ss => {
      if (ss.status !== 'scheduled') return ss;
      const dayImports = importsByDate.get(ss.date);
      if (!dayImports || dayImports.length === 0) return ss;

      // Build a string describing the planned session
      const plannedText = ss.workout_id
        ? (s.workouts.find(w => w.id === ss.workout_id)?.name || '') + ' ' +
          (s.workouts.find(w => w.id === ss.workout_id)?.goal || '') + ' ' +
          (s.workouts.find(w => w.id === ss.workout_id)?.primary_muscles?.join(' ') || '')
        : (ss.ai_template?.name || '') + ' ' + (ss.ai_template?.primary_muscles?.join(' ') || '');

      const match = dayImports.find(i => matchType(i.type, plannedText));
      if (match) {
        linked++;
        return {
          ...ss,
          status: 'completed' as const,
          completed_import_id: match.id,
        };
      }
      return ss;
    });

    return { ...s, scheduled_sessions: nextScheduled };
  });
  return { linked };
}

// ── Derived data helpers ──────────────────────────────────────────────

export function streakDays(sessions: Session[]): number {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map(s => s.started_at.slice(0, 10)));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) streak++;
    else if (i > 0) break; // missing today doesn't break the streak; missing any earlier day does
  }
  return streak;
}

export function sessionsThisWeek(sessions: Session[]): Session[] {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return sessions.filter(s => new Date(s.started_at) >= start);
}

export function totalVolumeThisWeek(sessions: Session[]): number {
  return sessionsThisWeek(sessions).reduce((s, sess) => s + (sess.total_volume_kg || 0), 0);
}

export function exportData(state: FitnessState): string {
  return JSON.stringify(state, null, 2);
}

export function importData(json: string, update: (m: (s: FitnessState) => FitnessState) => void): boolean {
  try {
    const parsed = JSON.parse(json) as Partial<FitnessState>;
    if (!parsed || typeof parsed !== 'object') return false;
    update(() => ({ ...EMPTY_STATE, ...parsed }));
    return true;
  } catch {
    return false;
  }
}

export function resetAll(update: (m: (s: FitnessState) => FitnessState) => void) {
  update(() => EMPTY_STATE);
}
