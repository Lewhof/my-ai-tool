// LH Fitness — data model
// All persisted to localStorage under namespaced keys (see store.ts)

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'core'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'forearms'
  | 'cardio' | 'fullbody' | 'mobility';

export type Equipment =
  | 'bodyweight' | 'dumbbells' | 'barbell' | 'kettlebell' | 'cable'
  | 'machine' | 'bands' | 'pullup_bar' | 'bench' | 'box' | 'rower' | 'bike';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export type Goal = 'strength' | 'hypertrophy' | 'endurance' | 'fat_loss' | 'mobility' | 'athletic';

export interface Exercise {
  id: string;
  name: string;
  primary: MuscleGroup;
  secondary?: MuscleGroup[];
  equipment: Equipment[];
  // Suggested defaults — user overrides per session
  sets: number;
  reps: string;        // "8-12" or "30s" or "AMRAP"
  rest_seconds: number;
  cue?: string;        // Coaching cue, one line
  // Time-based exercises (cardio, holds) use duration_seconds instead of reps
  duration_seconds?: number;
}

export interface Workout {
  id: string;
  name: string;
  description: string;
  goal: Goal;
  difficulty: Difficulty;
  duration_min: number;
  primary_muscles: MuscleGroup[];
  equipment: Equipment[];
  exercises: Exercise[];
  source: 'curated' | 'ai' | 'custom';
  tags?: string[];
  created_at: string;
}

// A logged set within a session
export interface LoggedSet {
  reps?: number;
  weight_kg?: number;
  duration_seconds?: number;
  rpe?: number; // 1-10
  completed: boolean;
}

// A logged exercise within a session
export interface LoggedExercise {
  exercise_id: string;
  exercise_name: string;
  sets: LoggedSet[];
  notes?: string;
}

export interface Session {
  id: string;
  workout_id: string;
  workout_name: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  exercises: LoggedExercise[];
  total_volume_kg?: number;
  rating?: number; // 1-5 how the session felt
  notes?: string;
}

export interface Profile {
  name: string;
  weight_kg?: number;
  height_cm?: number;
  age?: number;
  goals: Goal[];           // Multi-select — user can hybrid (e.g. strength + endurance + mobility)
  difficulty: Difficulty;
  available_equipment: Equipment[];
  weekly_target: number; // sessions/week
  default_training_time?: string; // HH:MM SAST — drives where fitness blocks land in the dashboard's calendar/planner. Per-session `time` overrides this. Falls back to 18:00 SAST.
  created_at: string;
}

export interface BodyMetric {
  date: string;       // ISO date (YYYY-MM-DD)
  weight_kg?: number;
  bf_pct?: number;
  notes?: string;
}

export interface PersonalRecord {
  exercise_id: string;
  exercise_name: string;
  type: 'max_weight' | 'max_reps' | 'max_volume' | 'best_time';
  value: number;
  unit: string;       // 'kg', 'reps', 'kg*reps', 's'
  date: string;
  session_id: string;
}

// ── Coach thread (level-up: multi-thread, modes, tool use) ──

export type CoachMode = 'quick' | 'deep';

export interface CoachSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface CoachToolUse {
  // 'web_search' and 'generate_workout' are legacy / server-tool entries.
  // Other names are calendar-mutation tools executed server-side.
  tool: 'web_search' | 'generate_workout' | 'get_schedule' | 'mark_rest_day' | 'skip_session' | 'reschedule_session' | 'swap_workout' | 'set_default_training_time' | 'set_session_time';
  // web_search fields
  query?: string;
  sources?: CoachSource[];
  // mutation-tool fields (other tools)
  input?: unknown;
  result?: unknown;
  ok?: boolean;
}

export interface CoachMessage {
  id: string;
  role: 'user' | 'coach';
  content: string;
  thinking?: string;             // extended-thinking summary (collapsed by default)
  tool_uses?: CoachToolUse[];    // web_search calls during this turn
  created_at: string;
}

export interface CoachThread {
  id: string;
  title: string;                 // auto-generated from first user message
  mode: CoachMode;
  messages: CoachMessage[];
  resulting_plan_id?: string;    // if a plan was synthesised + committed from this thread
  created_at: string;
  updated_at: string;
}

// ── Training plan + scheduled sessions (the calendar layer) ──

export interface PlanDay {
  day_offset: number;            // 0 = Mon, 6 = Sun
  type: 'workout' | 'rest' | 'optional';
  workout_id?: string;           // bound to a Workout from the library
  template?: {                   // OR loose AI-generated description
    name: string;
    primary_muscles?: MuscleGroup[];
    duration_min?: number;
    intensity?: 'easy' | 'moderate' | 'hard';
    notes?: string;
  };
}

export interface PlanWeek {
  week_num: number;              // 1-indexed
  theme?: string;                // "Volume base", "Deload", "Test week"
  days: PlanDay[];               // exactly 7
}

export interface TrainingPlan {
  id: string;
  name: string;
  description: string;
  source: 'ai_coach' | 'manual';
  goals: Goal[];
  weeks: PlanWeek[];
  active: boolean;               // only one active at a time
  starts_on: string;             // ISO date (Monday) where week 1 day 0 lands
  created_at: string;
  coach_thread_id?: string;
}

export type ScheduledStatus = 'scheduled' | 'completed' | 'skipped' | 'rescheduled';

export interface ScheduledSession {
  id: string;
  date: string;                  // ISO YYYY-MM-DD
  time?: string;                 // Optional HH:MM (SAST) — per-session override; trumps profile.default_training_time. Bridge falls back to 18:00 SAST when neither is set.
  plan_id?: string;
  plan_week_num?: number;
  plan_day_offset?: number;
  workout_id?: string;
  ai_template?: PlanDay['template'];
  status: ScheduledStatus;
  completed_session_id?: string;     // when completed via in-app live SessionView
  completed_import_id?: string;      // when completed via Garmin/external import auto-link
  rescheduled_to?: string;
  notes?: string;
  created_at: string;
}

// ── Imported (Garmin / Apple Health / manual) external workouts ──

export type ImportSource = 'garmin_csv' | 'garmin_tcx' | 'garmin_screenshot' | 'apple_health' | 'manual_external';

export interface ImportedWorkout {
  id: string;
  source: ImportSource;
  external_id?: string;          // for proper dedupe when available
  date: string;                  // ISO datetime
  type: string;                  // "Running", "Strength Training", "Cycling", etc.
  name?: string;
  duration_seconds?: number;
  distance_km?: number;
  calories?: number;
  avg_hr?: number;
  max_hr?: number;
  elevation_m?: number;
  notes?: string;
  raw?: Record<string, unknown>;
  imported_at: string;
}

export interface FitnessState {
  profile: Profile | null;
  workouts: Workout[];
  sessions: Session[];
  body_metrics: BodyMetric[];
  prs: PersonalRecord[];

  // Level-up additions
  coach_threads: CoachThread[];          // replaces flat coach_messages
  active_thread_id: string | null;
  plans: TrainingPlan[];
  scheduled_sessions: ScheduledSession[];
  imported_workouts: ImportedWorkout[];

  // Legacy (kept for migration; deprecated)
  coach_messages?: CoachMessage[];
}
