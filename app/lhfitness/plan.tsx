'use client';

import { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Play, Check, X,
  Dumbbell, Sparkles, Trash2, MoreHorizontal, ArrowRight, Wand2,
  CheckCircle2, Circle, SkipForward, Clock, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  FitnessState, Workout, ScheduledSession, TrainingPlan, ImportedWorkout, Goal,
} from './types';
import {
  getActivePlan, getScheduledForDate, manualScheduleSession,
  updateScheduledStatus, deletePlan, setActivePlan, rescheduleSession,
} from './store';

interface Props {
  state: FitnessState;
  dispatch: (m: (s: FitnessState) => FitnessState) => void;
  onStartWorkout: (w: Workout) => void;
  onNavigateToCoach: () => void;
}

type View = 'month' | 'week' | 'day';

const GOAL_DOT: Record<Goal, string> = {
  strength: 'bg-red-500',
  hypertrophy: 'bg-orange-500',
  fat_loss: 'bg-yellow-500',
  endurance: 'bg-blue-500',
  athletic: 'bg-purple-500',
  mobility: 'bg-emerald-500',
};

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayNamesFull = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export default function PlanView({ state, dispatch, onStartWorkout, onNavigateToCoach }: Props) {
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showPlansMenu, setShowPlansMenu] = useState(false);

  const activePlan = getActivePlan(state);

  const navigate = (delta: number) => {
    const next = new Date(cursor);
    if (view === 'month') next.setMonth(cursor.getMonth() + delta);
    else if (view === 'week') next.setDate(cursor.getDate() + 7 * delta);
    else next.setDate(cursor.getDate() + delta);
    setCursor(next);
  };

  const goToday = () => setCursor(new Date());

  // Build day cells for the current view
  const days = useMemo(() => {
    if (view === 'day') return [cursor];
    if (view === 'week') {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    // month: first day of month, then back-fill to Monday, total 42 cells (6 weeks)
    const first = startOfMonth(cursor);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor, view]);

  // Index sessions / imports by date for fast lookup
  const sessionsByDate = useMemo(() => {
    const m = new Map<string, ScheduledSession[]>();
    state.scheduled_sessions.forEach(ss => {
      const arr = m.get(ss.date) ?? [];
      arr.push(ss);
      m.set(ss.date, arr);
    });
    return m;
  }, [state.scheduled_sessions]);

  const completedByDate = useMemo(() => {
    const m = new Map<string, number>();
    state.sessions.forEach(s => {
      const date = s.started_at.slice(0, 10);
      m.set(date, (m.get(date) || 0) + 1);
    });
    return m;
  }, [state.sessions]);

  const importsByDate = useMemo(() => {
    const m = new Map<string, ImportedWorkout[]>();
    state.imported_workouts.forEach(i => {
      const date = i.date.slice(0, 10);
      const arr = m.get(date) ?? [];
      arr.push(i);
      m.set(date, arr);
    });
    return m;
  }, [state.imported_workouts]);

  const headerLabel = useMemo(() => {
    if (view === 'month') {
      return cursor.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    }
    if (view === 'week') {
      const start = startOfWeek(cursor);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return cursor.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, [cursor, view]);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <CalendarIcon className="text-primary" size={26} /> Plan
          </h1>
          {activePlan ? (
            <p className="text-muted-foreground text-sm mt-1">
              On <span className="text-foreground font-medium">"{activePlan.name}"</span> · {activePlan.weeks.length}-week block · {activePlan.goals.join(' + ')}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm mt-1">No active plan. Chat with the coach to build one.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state.plans.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowPlansMenu(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal size={14} />
              </button>
              {showPlansMenu && (
                <PlansMenu
                  plans={state.plans}
                  onClose={() => setShowPlansMenu(false)}
                  onActivate={(id) => { setActivePlan(id, dispatch); toast.success('Plan activated'); }}
                  onDelete={(id) => { if (confirm('Delete this plan?')) { deletePlan(id, dispatch); toast.success('Plan deleted'); } }}
                />
              )}
            </div>
          )}
          <button
            onClick={onNavigateToCoach}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground btn-brand"
          >
            <Wand2 size={13} /> {activePlan ? 'New plan' : 'Build a plan'}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary">
            <ChevronLeft size={16} />
          </button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-secondary">
            Today
          </button>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary">
            <ChevronRight size={16} />
          </button>
          <p className="ml-3 text-foreground font-bold">{headerLabel}</p>
        </div>
        <div className="inline-flex bg-card border border-border rounded-xl p-0.5">
          {(['month', 'week', 'day'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                view === v ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      {view === 'month' && (
        <MonthGrid
          days={days}
          cursor={cursor}
          state={state}
          sessionsByDate={sessionsByDate}
          completedByDate={completedByDate}
          importsByDate={importsByDate}
          onSelect={(d) => setSelectedDate(d)}
        />
      )}
      {view === 'week' && (
        <WeekGrid
          days={days}
          state={state}
          sessionsByDate={sessionsByDate}
          completedByDate={completedByDate}
          importsByDate={importsByDate}
          onSelect={(d) => setSelectedDate(d)}
        />
      )}
      {view === 'day' && (
        <DayDetail
          date={isoDate(cursor)}
          state={state}
          dispatch={dispatch}
          onStartWorkout={onStartWorkout}
        />
      )}

      {/* Day sheet (modal) */}
      {selectedDate && view !== 'day' && (
        <DaySheet
          date={selectedDate}
          state={state}
          dispatch={dispatch}
          onClose={() => setSelectedDate(null)}
          onStartWorkout={(w) => { setSelectedDate(null); onStartWorkout(w); }}
        />
      )}
    </div>
  );
}

// ── Month grid ────────────────────────────────────────────────────────

function MonthGrid({
  days, cursor, state, sessionsByDate, completedByDate, importsByDate, onSelect,
}: {
  days: Date[]; cursor: Date; state: FitnessState;
  sessionsByDate: Map<string, ScheduledSession[]>;
  completedByDate: Map<string, number>;
  importsByDate: Map<string, ImportedWorkout[]>;
  onSelect: (d: string) => void;
}) {
  const workoutById = useMemo(() => new Map(state.workouts.map(w => [w.id, w])), [state.workouts]);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {dayNames.map(d => (
          <div key={d} className="px-2 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const date = isoDate(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const today = isToday(d);
          const sched = sessionsByDate.get(date) || [];
          const done = completedByDate.get(date) || 0;
          const imps = importsByDate.get(date) || [];
          const totalEvents = sched.length + done + imps.length;
          return (
            <button
              key={i}
              onClick={() => onSelect(date)}
              className={cn(
                'min-h-[88px] p-1.5 text-left border-b border-r border-border last:border-r-0 transition-colors hover:bg-secondary/40 flex flex-col gap-1',
                !inMonth && 'opacity-40',
                today && 'bg-primary/5 ring-1 ring-primary/40 ring-inset'
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  'text-xs font-bold tabular-nums',
                  today ? 'text-primary' : inMonth ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {d.getDate()}
                </span>
                {totalEvents > 0 && (
                  <span className="text-[9px] text-muted-foreground tabular-nums">{totalEvents}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {sched.slice(0, 3).map(ss => {
                  const w = ss.workout_id ? workoutById.get(ss.workout_id) : undefined;
                  const goal: Goal = (w?.goal as Goal) || (state.profile?.goals?.[0] as Goal) || 'hypertrophy';
                  return (
                    <div key={ss.id} className={cn(
                      'flex items-center gap-1 text-[9px] truncate rounded px-1 py-0.5',
                      ss.status === 'completed' && 'bg-emerald-500/10 text-emerald-400 line-through opacity-70',
                      ss.status === 'skipped' && 'bg-secondary text-muted-foreground line-through opacity-50',
                      ss.status === 'scheduled' && 'bg-primary/10 text-primary'
                    )}>
                      <span className={cn('w-1 h-1 rounded-full', GOAL_DOT[goal])} />
                      <span className="truncate">{w?.name || ss.ai_template?.name || 'Session'}</span>
                    </div>
                  );
                })}
                {imps.slice(0, 2).map(imp => (
                  <div key={imp.id} className="flex items-center gap-1 text-[9px] truncate rounded px-1 py-0.5 bg-blue-500/10 text-blue-400">
                    <Activity size={7} />
                    <span className="truncate">{imp.type}</span>
                  </div>
                ))}
                {(sched.length + imps.length) > 5 && (
                  <p className="text-[9px] text-muted-foreground">+{sched.length + imps.length - 5} more</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Week grid ─────────────────────────────────────────────────────────

function WeekGrid({
  days, state, sessionsByDate, completedByDate, importsByDate, onSelect,
}: {
  days: Date[]; state: FitnessState;
  sessionsByDate: Map<string, ScheduledSession[]>;
  completedByDate: Map<string, number>;
  importsByDate: Map<string, ImportedWorkout[]>;
  onSelect: (d: string) => void;
}) {
  const workoutById = useMemo(() => new Map(state.workouts.map(w => [w.id, w])), [state.workouts]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((d) => {
        const date = isoDate(d);
        const today = isToday(d);
        const sched = sessionsByDate.get(date) || [];
        const imps = importsByDate.get(date) || [];
        const done = completedByDate.get(date) || 0;
        return (
          <button
            key={date}
            onClick={() => onSelect(date)}
            className={cn(
              'bg-card border rounded-xl p-3 text-left transition-colors hover:border-primary/40 min-h-[140px]',
              today ? 'border-primary/40 bg-primary/5' : 'border-border'
            )}
          >
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{d.toLocaleDateString('en-ZA', { weekday: 'short' })}</p>
                <p className={cn('text-2xl font-bold tabular-nums', today ? 'text-primary' : 'text-foreground')}>{d.getDate()}</p>
              </div>
              {done > 0 && (
                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                  <Check size={10} /> {done}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {sched.map(ss => {
                const w = ss.workout_id ? workoutById.get(ss.workout_id) : undefined;
                const goal: Goal = (w?.goal as Goal) || (state.profile?.goals?.[0] as Goal) || 'hypertrophy';
                return (
                  <div key={ss.id} className={cn(
                    'flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 border',
                    ss.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400 line-through opacity-80' :
                    ss.status === 'skipped' ? 'border-border bg-secondary text-muted-foreground line-through opacity-50' :
                    'border-primary/30 bg-primary/5 text-foreground'
                  )}>
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', GOAL_DOT[goal])} />
                    <span className="truncate flex-1">{w?.name || ss.ai_template?.name || 'Session'}</span>
                  </div>
                );
              })}
              {imps.map(imp => (
                <div key={imp.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 border border-blue-500/30 bg-blue-500/5 text-blue-400">
                  <Activity size={10} className="shrink-0" />
                  <span className="truncate">{imp.type}</span>
                  {imp.duration_seconds && <span className="text-[10px] opacity-70 tabular-nums">{Math.round(imp.duration_seconds / 60)}m</span>}
                </div>
              ))}
              {sched.length === 0 && imps.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic">Rest / open</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Day detail ────────────────────────────────────────────────────────

function DayDetail({
  date, state, dispatch, onStartWorkout,
}: {
  date: string; state: FitnessState;
  dispatch: (m: (s: FitnessState) => FitnessState) => void;
  onStartWorkout: (w: Workout) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <DayContents date={date} state={state} dispatch={dispatch} onStartWorkout={onStartWorkout} />
    </div>
  );
}

function DaySheet({
  date, state, dispatch, onClose, onStartWorkout,
}: {
  date: string; state: FitnessState;
  dispatch: (m: (s: FitnessState) => FitnessState) => void;
  onClose: () => void;
  onStartWorkout: (w: Workout) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-up">
      <div className="bg-background border-t sm:border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between sticky top-0 bg-background">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              {dayNamesFull[(new Date(date).getDay() + 6) % 7]}
            </p>
            <h2 className="text-foreground font-bold text-xl">
              {new Date(date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <DayContents date={date} state={state} dispatch={dispatch} onStartWorkout={onStartWorkout} />
        </div>
      </div>
    </div>
  );
}

function DayContents({
  date, state, dispatch, onStartWorkout,
}: {
  date: string; state: FitnessState;
  dispatch: (m: (s: FitnessState) => FitnessState) => void;
  onStartWorkout: (w: Workout) => void;
}) {
  const [showAddManual, setShowAddManual] = useState(false);
  const sched = getScheduledForDate(state, date);
  const imps = state.imported_workouts.filter(i => i.date.slice(0, 10) === date);
  const dones = state.sessions.filter(s => s.started_at.slice(0, 10) === date);
  const workoutById = useMemo(() => new Map(state.workouts.map(w => [w.id, w])), [state.workouts]);

  return (
    <div className="space-y-5">
      {/* Scheduled */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-foreground font-bold text-sm">Planned ({sched.length})</h3>
          <button
            onClick={() => setShowAddManual(o => !o)}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium"
          >
            <Plus size={11} /> Add session
          </button>
        </div>
        {showAddManual && (
          <ManualSchedule
            date={date}
            workouts={state.workouts}
            onClose={() => setShowAddManual(false)}
            onAdd={(workoutId) => {
              manualScheduleSession(date, workoutId, dispatch);
              setShowAddManual(false);
              toast.success('Session scheduled');
            }}
          />
        )}
        {sched.length === 0 && !showAddManual && (
          <p className="text-muted-foreground text-sm italic">Nothing scheduled.</p>
        )}
        <div className="space-y-2">
          {sched.map(ss => {
            const w = ss.workout_id ? workoutById.get(ss.workout_id) : undefined;
            return (
              <ScheduledRow
                key={ss.id}
                scheduled={ss}
                workout={w}
                workouts={state.workouts}
                onStart={(w) => onStartWorkout(w)}
                onUpdate={(patch) => updateScheduledStatus(ss.id, patch, dispatch)}
                onReschedule={(d) => { rescheduleSession(ss.id, d, dispatch); toast.success('Rescheduled'); }}
              />
            );
          })}
        </div>
      </section>

      {/* Completed sessions */}
      {dones.length > 0 && (
        <section>
          <h3 className="text-foreground font-bold text-sm mb-2">Completed ({dones.length})</h3>
          <div className="space-y-2">
            {dones.map(d => (
              <div key={d.id} className="bg-card border border-emerald-500/30 rounded-xl p-3 flex items-center gap-3">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium text-sm truncate">{d.workout_name}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {d.duration_seconds ? `${Math.round(d.duration_seconds / 60)} min` : ''}
                    {d.total_volume_kg ? ` · ${Math.round(d.total_volume_kg)}kg volume` : ''}
                    {d.rating ? ` · felt ${d.rating}/5` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Imported (Garmin) */}
      {imps.length > 0 && (
        <section>
          <h3 className="text-foreground font-bold text-sm mb-2 flex items-center gap-2">
            <Activity size={14} className="text-blue-400" /> External imports ({imps.length})
          </h3>
          <div className="space-y-2">
            {imps.map(i => (
              <div key={i.id} className="bg-card border border-blue-500/30 rounded-xl p-3 flex items-center gap-3">
                <Activity size={16} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium text-sm truncate">
                    {i.name || i.type}
                    <span className="text-[10px] text-muted-foreground font-normal ml-2 uppercase tracking-wide">{i.source.replace('garmin_', 'Garmin ')}</span>
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {i.duration_seconds && `${Math.round(i.duration_seconds / 60)}m`}
                    {i.distance_km && ` · ${i.distance_km.toFixed(2)}km`}
                    {i.calories && ` · ${i.calories}kcal`}
                    {i.avg_hr && ` · avg ${i.avg_hr}bpm`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sched.length === 0 && dones.length === 0 && imps.length === 0 && !showAddManual && (
        <div className="text-center py-8 text-muted-foreground">
          <Circle size={28} className="mx-auto opacity-30 mb-2" />
          <p className="text-sm">Open day. Add a session or take it as a rest day.</p>
        </div>
      )}
    </div>
  );
}

function ScheduledRow({
  scheduled, workout, workouts, onStart, onUpdate, onReschedule,
}: {
  scheduled: ScheduledSession;
  workout: Workout | undefined;
  workouts: Workout[];
  onStart: (w: Workout) => void;
  onUpdate: (patch: { status?: ScheduledSession['status']; workout_id?: string; notes?: string }) => void;
  onReschedule: (d: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [showRescheduler, setShowRescheduler] = useState(false);

  return (
    <div className={cn(
      'bg-card border rounded-xl p-3',
      scheduled.status === 'completed' ? 'border-emerald-500/30' :
      scheduled.status === 'skipped' ? 'border-border opacity-60' :
      'border-primary/30'
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
          scheduled.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
          scheduled.status === 'skipped' ? 'bg-secondary text-muted-foreground' :
          'bg-primary/15 text-primary'
        )}>
          <Dumbbell size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-foreground font-medium text-sm truncate',
            scheduled.status === 'skipped' && 'line-through'
          )}>
            {workout?.name || scheduled.ai_template?.name || 'Session'}
          </p>
          <p className="text-muted-foreground text-[11px]">
            {workout?.duration_min ? `${workout.duration_min}m` : scheduled.ai_template?.duration_min ? `${scheduled.ai_template.duration_min}m` : ''}
            {workout?.goal && ` · ${workout.goal.replace('_', ' ')}`}
            {scheduled.ai_template?.intensity && ` · ${scheduled.ai_template.intensity}`}
            {scheduled.plan_week_num && ` · plan wk ${scheduled.plan_week_num}`}
          </p>
        </div>
        {scheduled.status === 'scheduled' && workout && (
          <button
            onClick={() => onStart(workout)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground btn-brand flex items-center gap-1.5 shrink-0"
          >
            <Play size={11} fill="currentColor" /> Start
          </button>
        )}
        {scheduled.status === 'scheduled' && !workout && (
          <button
            onClick={() => setPicking(o => !o)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/40 text-primary shrink-0"
          >
            Pick workout
          </button>
        )}
      </div>

      {picking && !workout && (
        <div className="mt-2 grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
          {workouts.map(w => (
            <button
              key={w.id}
              onClick={() => { onUpdate({ workout_id: w.id }); setPicking(false); }}
              className="text-left text-xs p-2 rounded bg-secondary hover:bg-primary/10 hover:text-primary"
            >
              {w.name} <span className="text-muted-foreground">· {w.goal} · {w.duration_min}m</span>
            </button>
          ))}
        </div>
      )}

      {scheduled.status === 'scheduled' && (
        <div className="mt-2 flex gap-2 flex-wrap text-[11px]">
          <button onClick={() => onUpdate({ status: 'skipped' })} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
            <SkipForward size={11} /> Skip
          </button>
          <button onClick={() => setShowRescheduler(o => !o)} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Clock size={11} /> Reschedule
          </button>
          {showRescheduler && (
            <input
              type="date"
              defaultValue={scheduled.date}
              onChange={(e) => { if (e.target.value) onReschedule(e.target.value); }}
              className="bg-secondary border border-border rounded px-2 py-0.5 text-foreground text-[11px]"
            />
          )}
        </div>
      )}

      {scheduled.status === 'completed' && (
        <p className="mt-2 text-emerald-400 text-[11px] flex items-center gap-1">
          <CheckCircle2 size={11} /> Completed
        </p>
      )}
      {scheduled.status === 'skipped' && (
        <button
          onClick={() => onUpdate({ status: 'scheduled' })}
          className="mt-2 text-muted-foreground hover:text-foreground text-[11px]"
        >
          Restore
        </button>
      )}
    </div>
  );
}

function ManualSchedule({
  date, workouts, onClose, onAdd,
}: {
  date: string; workouts: Workout[]; onClose: () => void; onAdd: (id: string | undefined) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = workouts.filter(w => !search || w.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="bg-secondary/50 border border-border rounded-xl p-3 mb-2">
      <div className="flex gap-2 mb-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search library..."
          className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:border-primary/60 focus:outline-none"
        />
        <button onClick={onClose} className="text-muted-foreground"><X size={14} /></button>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1">
        <button
          onClick={() => onAdd(undefined)}
          className="block w-full text-left text-xs p-2 rounded bg-card hover:bg-primary/10 text-foreground"
        >
          <span className="text-muted-foreground italic">Open slot — pick workout later</span>
        </button>
        {filtered.map(w => (
          <button
            key={w.id}
            onClick={() => onAdd(w.id)}
            className="block w-full text-left text-xs p-2 rounded bg-card hover:bg-primary/10 text-foreground"
          >
            {w.name} <span className="text-muted-foreground">· {w.goal} · {w.duration_min}m</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlansMenu({
  plans, onClose, onActivate, onDelete,
}: {
  plans: TrainingPlan[]; onClose: () => void;
  onActivate: (id: string) => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-1 w-72 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden" onMouseLeave={onClose}>
      <div className="px-3 py-2 border-b border-border">
        <p className="text-xs font-bold text-foreground">All plans</p>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {plans.map(p => (
          <div key={p.id} className={cn(
            'group px-3 py-2.5 flex items-start gap-2 hover:bg-secondary',
            p.active && 'bg-primary/5'
          )}>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium truncate', p.active ? 'text-primary' : 'text-foreground')}>
                {p.name} {p.active && <span className="text-[9px] uppercase ml-1">active</span>}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{p.weeks.length}w · {p.goals.join('+')} · {new Date(p.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              {!p.active && (
                <button onClick={() => onActivate(p.id)} className="text-[10px] text-primary font-medium" title="Activate">Set active</button>
              )}
              <button onClick={() => onDelete(p.id)} className="text-muted-foreground hover:text-red-400" title="Delete">
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
