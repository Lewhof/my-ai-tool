'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, Pause, Play, X, ChevronLeft, ChevronRight, Trophy, Clock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Workout, Session, LoggedSet } from './types';
import { startSession, finishSession } from './store';

interface Props {
  workout: Workout;
  onFinish: (session: Session | null, dispatch: (m: (s: import('./types').FitnessState) => import('./types').FitnessState) => void) => void;
  onCancel: () => void;
  dispatch: (m: (s: import('./types').FitnessState) => import('./types').FitnessState) => void;
  // Optional last session of the same workout — used to suggest weights/reps
  lastSession?: Session;
}

export default function SessionView({ workout, onFinish, onCancel, dispatch, lastSession }: Props) {
  const [session, setSession] = useState<Session>(() => startSession(workout));
  const [activeIdx, setActiveIdx] = useState(0);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTotal, setRestTotal] = useState(0);
  const [restPaused, setRestPaused] = useState(false);
  const [pausedRemaining, setPausedRemaining] = useState(0);
  const [showFinish, setShowFinish] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const startTimeRef = useRef(Date.now());
  const completionAudioRef = useRef<HTMLAudioElement | null>(null);

  // Total elapsed time
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Rest timer
  useEffect(() => {
    if (!restEndsAt || restPaused) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
      setRestSeconds(remaining);
      if (remaining === 0) {
        playSound();
        try { navigator.vibrate?.(200); } catch { /* not supported */ }
        setRestEndsAt(null);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [restEndsAt, restPaused]);

  const playSound = () => {
    try {
      if (!completionAudioRef.current) {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch { /* audio context disallowed */ }
  };

  const activeExercise = workout.exercises[activeIdx];
  const activeLogged = session.exercises[activeIdx];
  const completedSets = activeLogged.sets.filter(s => s.completed).length;
  const totalCompletedSets = session.exercises.reduce((t, ex) => t + ex.sets.filter(s => s.completed).length, 0);
  const totalSets = session.exercises.reduce((t, ex) => t + ex.sets.length, 0);
  const overallProgress = totalSets > 0 ? Math.round((totalCompletedSets / totalSets) * 100) : 0;

  const updateSet = useCallback((setIdx: number, patch: Partial<LoggedSet>) => {
    setSession(prev => {
      const next = { ...prev };
      next.exercises = next.exercises.map((ex, i) => {
        if (i !== activeIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, si) => si === setIdx ? { ...s, ...patch } : s),
        };
      });
      return next;
    });
  }, [activeIdx]);

  const completeSet = (setIdx: number) => {
    const set = activeLogged.sets[setIdx];
    if (set.completed) {
      // Uncomplete
      updateSet(setIdx, { completed: false });
      return;
    }
    updateSet(setIdx, { completed: true });

    // Start rest timer
    if (activeExercise.rest_seconds > 0) {
      setRestTotal(activeExercise.rest_seconds);
      setRestEndsAt(Date.now() + activeExercise.rest_seconds * 1000);
      setRestSeconds(activeExercise.rest_seconds);
      setRestPaused(false);
    }

    // Auto-advance if all sets done
    const allDone = activeLogged.sets.every((s, i) => i === setIdx ? true : s.completed);
    if (allDone && activeIdx < workout.exercises.length - 1) {
      setTimeout(() => setActiveIdx(activeIdx + 1), 600);
    }
  };

  const skipRest = () => { setRestEndsAt(null); setRestPaused(false); };
  const pauseRest = () => {
    if (!restEndsAt) return;
    setPausedRemaining(Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000)));
    setRestPaused(true);
  };
  const resumeRest = () => {
    if (!restPaused) return;
    setRestEndsAt(Date.now() + pausedRemaining * 1000);
    setRestPaused(false);
  };
  const addRest = (seconds: number) => {
    if (!restEndsAt && !restPaused) return;
    if (restPaused) {
      setPausedRemaining(prev => Math.max(0, prev + seconds));
    } else if (restEndsAt) {
      setRestEndsAt(restEndsAt + seconds * 1000);
    }
  };

  const lastSessionExercise = lastSession?.exercises.find(e => e.exercise_id === activeExercise.id);

  const handleFinishConfirm = (rating: number | undefined, notes: string | undefined) => {
    const finished = finishSession(session, rating, notes, dispatch);
    onFinish(finished, dispatch);
  };

  const ex = activeExercise;
  const restPctRemaining = restTotal > 0 ? (restSeconds / restTotal) * 100 : 0;

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-3 safe-top bg-background/95 backdrop-blur">
        <button
          onClick={() => { if (confirm('Cancel session? Your progress won\'t be saved.')) onCancel(); }}
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-foreground font-bold text-sm truncate">{workout.name}</p>
          <p className="text-muted-foreground text-xs flex items-center gap-2">
            <span className="flex items-center gap-1"><Clock size={10} /> {formatTime(elapsed)}</span>
            <span>·</span>
            <span>{totalCompletedSets}/{totalSets} sets</span>
          </p>
        </div>
        <button
          onClick={() => setShowFinish(true)}
          className="bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-bold"
        >
          Finish
        </button>
      </div>

      {/* Overall progress bar */}
      <div className="h-1 bg-border">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${overallProgress}%` }} />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
          {/* Exercise header */}
          <div className="text-center mb-6 mt-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
              Exercise {activeIdx + 1} of {workout.exercises.length}
            </p>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">{ex.name}</h2>
            <p className="text-muted-foreground text-sm mt-2 capitalize">
              {ex.sets} × {ex.reps}
              {ex.rest_seconds > 0 && ` · ${ex.rest_seconds}s rest`}
            </p>
            {ex.cue && (
              <p className="text-primary/80 italic text-sm mt-3 max-w-md mx-auto">"{ex.cue}"</p>
            )}
          </div>

          {/* Last session reference */}
          {lastSessionExercise && lastSessionExercise.sets.some(s => s.completed && (s.weight_kg || s.reps)) && (
            <div className="bg-card border border-border rounded-xl p-3 mb-4 text-center">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Last time</p>
              <p className="text-foreground text-sm font-medium">
                {lastSessionExercise.sets.filter(s => s.completed).map((s, i) =>
                  `${s.reps || '–'}${s.weight_kg ? `×${s.weight_kg}kg` : ''}`
                ).join(' · ')}
              </p>
            </div>
          )}

          {/* Sets */}
          <div className="space-y-2.5">
            {activeLogged.sets.map((set, i) => (
              <SetRow
                key={i}
                idx={i}
                set={set}
                isTimeBased={!!ex.duration_seconds}
                defaultDuration={ex.duration_seconds}
                onUpdate={(patch) => updateSet(i, patch)}
                onComplete={() => completeSet(i)}
                lastSet={lastSessionExercise?.sets[i]}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Rest timer overlay */}
      {(restEndsAt || restPaused) && (
        <RestTimer
          remaining={restSeconds}
          total={restTotal}
          paused={restPaused}
          pct={restPctRemaining}
          onSkip={skipRest}
          onPause={pauseRest}
          onResume={resumeRest}
          onAdd={() => addRest(15)}
          onSubtract={() => addRest(-15)}
        />
      )}

      {/* Bottom nav */}
      <div className="border-t border-border bg-background/95 backdrop-blur safe-bottom">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button
            onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
            disabled={activeIdx === 0}
            className="p-2.5 rounded-xl border border-border text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide">
            {workout.exercises.map((e, i) => {
              const done = session.exercises[i].sets.every(s => s.completed);
              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    'shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors',
                    i === activeIdx
                      ? 'bg-primary text-primary-foreground'
                      : done
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-card text-muted-foreground border border-border'
                  )}
                >
                  {done && <Check size={10} className="inline -mt-0.5 mr-1" />}
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setActiveIdx(Math.min(workout.exercises.length - 1, activeIdx + 1))}
            disabled={activeIdx === workout.exercises.length - 1}
            className="p-2.5 rounded-xl border border-border text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Finish modal */}
      {showFinish && (
        <FinishModal
          completedSets={totalCompletedSets}
          totalSets={totalSets}
          duration={elapsed}
          onCancel={() => setShowFinish(false)}
          onFinish={handleFinishConfirm}
        />
      )}
    </div>
  );
}

function SetRow({
  idx, set, isTimeBased, defaultDuration, onUpdate, onComplete, lastSet,
}: {
  idx: number;
  set: LoggedSet;
  isTimeBased: boolean;
  defaultDuration?: number;
  onUpdate: (patch: Partial<LoggedSet>) => void;
  onComplete: () => void;
  lastSet?: LoggedSet;
}) {
  return (
    <div className={cn(
      'rounded-xl border p-3 transition-all',
      set.completed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0',
          set.completed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary text-muted-foreground'
        )}>
          {idx + 1}
        </div>

        {isTimeBased ? (
          <div className="flex-1 min-w-0">
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Duration</label>
            <input
              type="number"
              inputMode="numeric"
              value={set.duration_seconds ?? defaultDuration ?? ''}
              onChange={(e) => onUpdate({ duration_seconds: e.target.value ? Number(e.target.value) : undefined })}
              placeholder={String(defaultDuration ?? 30)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground tabular-nums focus:border-primary/60 focus:outline-none"
            />
            <span className="text-[10px] text-muted-foreground">seconds</span>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Reps</label>
              <input
                type="number"
                inputMode="numeric"
                value={set.reps ?? ''}
                onChange={(e) => onUpdate({ reps: e.target.value ? Number(e.target.value) : undefined })}
                placeholder={lastSet?.reps ? String(lastSet.reps) : '–'}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground tabular-nums focus:border-primary/60 focus:outline-none"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Weight (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={set.weight_kg ?? ''}
                onChange={(e) => onUpdate({ weight_kg: e.target.value ? Number(e.target.value) : undefined })}
                placeholder={lastSet?.weight_kg ? String(lastSet.weight_kg) : '–'}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground tabular-nums focus:border-primary/60 focus:outline-none"
              />
            </div>
          </>
        )}

        <button
          onClick={onComplete}
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all',
            set.completed
              ? 'bg-emerald-500 text-white shadow-[0_0_18px_rgb(16_185_129_/_0.4)]'
              : 'bg-primary text-primary-foreground btn-brand'
          )}
        >
          <Check size={20} />
        </button>
      </div>
    </div>
  );
}

function RestTimer({
  remaining, total, paused, pct, onSkip, onPause, onResume, onAdd, onSubtract,
}: {
  remaining: number; total: number; paused: boolean; pct: number;
  onSkip: () => void; onPause: () => void; onResume: () => void; onAdd: () => void; onSubtract: () => void;
}) {
  const r = 90;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-up">
      <div className="text-center">
        <p className="text-muted-foreground uppercase tracking-widest text-xs mb-6">Rest</p>
        <div className="relative inline-block mb-8">
          <svg width="220" height="220" className="-rotate-90">
            <circle cx="110" cy="110" r={r} stroke="oklch(1 0 0 / 0.08)" strokeWidth="8" fill="none" />
            <circle
              cx="110" cy="110" r={r}
              stroke="var(--color-primary)"
              strokeWidth="8" fill="none"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.4s linear', filter: 'drop-shadow(0 0 12px var(--brand-glow))' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-6xl font-bold text-foreground tabular-nums">{remaining}</p>
            <p className="text-muted-foreground text-xs uppercase tracking-wider mt-1">{paused ? 'paused' : 'seconds'}</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={onSubtract}
            className="px-4 py-2.5 rounded-xl border border-border text-foreground hover:bg-secondary text-sm font-medium tabular-nums"
          >
            −15s
          </button>
          {paused ? (
            <button
              onClick={onResume}
              className="w-14 h-14 rounded-full bg-primary text-primary-foreground btn-brand flex items-center justify-center"
            >
              <Play size={22} className="ml-1" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={onPause}
              className="w-14 h-14 rounded-full bg-card border border-border text-foreground flex items-center justify-center"
            >
              <Pause size={22} fill="currentColor" />
            </button>
          )}
          <button
            onClick={onAdd}
            className="px-4 py-2.5 rounded-xl border border-border text-foreground hover:bg-secondary text-sm font-medium tabular-nums"
          >
            +15s
          </button>
        </div>

        <button
          onClick={onSkip}
          className="mt-6 text-muted-foreground hover:text-foreground text-sm font-medium"
        >
          Skip rest
        </button>
      </div>
    </div>
  );
}

function FinishModal({
  completedSets, totalSets, duration, onCancel, onFinish,
}: {
  completedSets: number; totalSets: number; duration: number;
  onCancel: () => void; onFinish: (rating: number | undefined, notes: string | undefined) => void;
}) {
  const [rating, setRating] = useState<number | undefined>();
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-up">
      <div className="bg-background border-t sm:border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto mb-3">
            <Trophy size={26} className="text-emerald-400" />
          </div>
          <h3 className="text-foreground font-bold text-2xl">Session done</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {completedSets}/{totalSets} sets · {Math.floor(duration / 60)}m {duration % 60}s
          </p>
        </div>

        <div className="mb-4">
          <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">How did it feel?</label>
          <div className="flex justify-between gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={cn(
                  'flex-1 h-12 rounded-lg font-bold text-lg transition-all',
                  rating === n
                    ? 'bg-primary text-primary-foreground shadow-[0_0_18px_var(--brand-glow)]'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
            <span>Easy</span><span>Average</span><span>Brutal</span>
          </div>
        </div>

        <div className="mb-5">
          <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2 flex items-center gap-1">
            <MessageSquare size={11} /> Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="PR, felt strong, etc."
            rows={2}
            className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary"
          >
            Keep going
          </button>
          <button
            onClick={() => onFinish(rating, notes.trim() || undefined)}
            className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground btn-brand"
          >
            Save & finish
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
