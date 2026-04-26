'use client';

import { useEffect, useState, useCallback } from 'react';
import type {
  FitnessState, Profile, Workout, Session, BodyMetric, PersonalRecord,
  CoachMessage, CoachThread, CoachMode, LoggedExercise, LoggedSet,
  TrainingPlan, ScheduledSession, ImportedWorkout, ScheduledStatus,
} from './types';
import { SEED_WORKOUTS } from './seed';

const STORAGE_KEY = 'lhfitness:v1';

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
  } catch {
    /* quota or private mode — ignore */
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
