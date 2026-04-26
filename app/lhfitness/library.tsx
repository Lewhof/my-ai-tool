'use client';

import { useState, useMemo } from 'react';
import { Sparkles, Loader2, Play, Clock, Dumbbell, Search, X, Trash2, ChevronRight, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FitnessState, Workout, Goal, Equipment, Difficulty } from './types';

interface Props {
  state: FitnessState;
  onStartWorkout: (workout: Workout) => void;
  onAddWorkout: (workout: Workout) => void;
  onDeleteWorkout: (id: string) => void;
}

const GOAL_TONE: Record<Goal, string> = {
  strength: 'from-red-500/30 to-transparent',
  hypertrophy: 'from-orange-500/30 to-transparent',
  fat_loss: 'from-yellow-500/30 to-transparent',
  endurance: 'from-blue-500/30 to-transparent',
  athletic: 'from-purple-500/30 to-transparent',
  mobility: 'from-emerald-500/30 to-transparent',
};

const FILTERS: Array<{ id: 'all' | Goal; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'strength', label: 'Strength' },
  { id: 'hypertrophy', label: 'Muscle' },
  { id: 'fat_loss', label: 'Fat Loss' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'athletic', label: 'Athletic' },
  { id: 'mobility', label: 'Mobility' },
];

export default function LibraryView({ state, onStartWorkout, onAddWorkout, onDeleteWorkout }: Props) {
  const [filter, setFilter] = useState<'all' | Goal>('all');
  const [search, setSearch] = useState('');
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [previewWorkout, setPreviewWorkout] = useState<Workout | null>(null);

  const filtered = useMemo(() => {
    let list = state.workouts;
    if (filter !== 'all') list = list.filter(w => w.goal === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q) ||
        w.exercises.some(e => e.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [state.workouts, filter, search]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Workout Library</h1>
          <p className="text-muted-foreground text-sm mt-1">{state.workouts.length} workouts. Pick one or generate something new.</p>
        </div>
        <button
          onClick={() => setGeneratorOpen(true)}
          className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 btn-brand"
        >
          <Wand2 size={16} /> Generate workout
        </button>
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workouts or exercises..."
            className="w-full bg-card border border-border rounded-xl pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border',
                filter === f.id
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Dumbbell size={32} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-foreground font-bold">No workouts match</p>
          <p className="text-muted-foreground text-sm mt-1">Try a different filter or generate a new workout.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(w => (
            <WorkoutCard
              key={w.id}
              workout={w}
              onStart={() => onStartWorkout(w)}
              onPreview={() => setPreviewWorkout(w)}
              onDelete={w.source !== 'curated' ? () => onDeleteWorkout(w.id) : undefined}
            />
          ))}
        </div>
      )}

      {generatorOpen && state.profile && (
        <GeneratorModal
          state={state}
          onClose={() => setGeneratorOpen(false)}
          onGenerated={(w) => {
            onAddWorkout(w);
            setGeneratorOpen(false);
            setPreviewWorkout(w);
          }}
        />
      )}

      {previewWorkout && (
        <PreviewModal
          workout={previewWorkout}
          onClose={() => setPreviewWorkout(null)}
          onStart={() => {
            onStartWorkout(previewWorkout);
            setPreviewWorkout(null);
          }}
        />
      )}
    </div>
  );
}

function WorkoutCard({
  workout, onStart, onPreview, onDelete,
}: {
  workout: Workout; onStart: () => void; onPreview: () => void; onDelete?: () => void;
}) {
  return (
    <div className="group relative bg-card border border-border hover:border-primary/40 rounded-2xl overflow-hidden transition-all">
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-40 pointer-events-none', GOAL_TONE[workout.goal])} />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {workout.source === 'ai' && (
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold flex items-center gap-1 bg-primary/10 px-1.5 py-0.5 rounded">
                <Sparkles size={10} /> AI
              </span>
            )}
            {workout.source === 'custom' && (
              <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold bg-blue-400/10 px-1.5 py-0.5 rounded">Custom</span>
            )}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize">{workout.goal.replace('_', ' ')}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize">{workout.difficulty}</span>
          </div>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); if (confirm('Delete this workout?')) onDelete(); }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <button onClick={onPreview} className="text-left w-full">
          <h3 className="text-foreground font-bold text-lg mb-1">{workout.name}</h3>
          <p className="text-muted-foreground text-sm line-clamp-2 mb-4">{workout.description}</p>
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock size={11} /> {workout.duration_min}m</span>
            <span className="flex items-center gap-1"><Dumbbell size={11} /> {workout.exercises.length}</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={onPreview}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg border border-border hover:border-primary/40 transition-colors"
            >
              Details
            </button>
            <button
              onClick={onStart}
              className="px-3 py-1.5 text-xs font-bold text-primary-foreground bg-primary rounded-lg flex items-center gap-1.5 hover:shadow-[0_0_18px_var(--brand-glow)] transition-shadow"
            >
              <Play size={11} fill="currentColor" /> Start
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ workout, onClose, onStart }: {
  workout: Workout; onClose: () => void; onStart: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-up">
      <div className="bg-background border-t sm:border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-border flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-primary font-semibold capitalize">{workout.goal.replace('_', ' ')}</span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground capitalize">{workout.difficulty}</span>
            </div>
            <h2 className="text-foreground font-bold text-xl">{workout.name}</h2>
            <p className="text-muted-foreground text-sm mt-1">{workout.description}</p>
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock size={12} /> {workout.duration_min} min</span>
              <span className="flex items-center gap-1"><Dumbbell size={12} /> {workout.exercises.length} exercises</span>
              <span>{workout.equipment.join(', ')}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground -mt-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {workout.exercises.map((e, i) => (
            <div key={e.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h4 className="text-foreground font-semibold">{e.name}</h4>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {e.sets} × {e.reps}{e.rest_seconds > 0 && ` · ${e.rest_seconds}s rest`}
                    </p>
                  </div>
                  {e.cue && <p className="text-muted-foreground text-xs mt-1.5 italic">"{e.cue}"</p>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary"
          >
            Close
          </button>
          <button
            onClick={onStart}
            className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground btn-brand flex items-center justify-center gap-2"
          >
            <Play size={14} fill="currentColor" /> Start session
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneratorModal({
  state, onClose, onGenerated,
}: {
  state: FitnessState; onClose: () => void; onGenerated: (w: Workout) => void;
}) {
  const profile = state.profile!;
  const [goal, setGoal] = useState<Goal>(profile.goals[0] ?? 'hypertrophy');
  const [difficulty, setDifficulty] = useState<Difficulty>(profile.difficulty);
  const [duration, setDuration] = useState(45);
  const [equipment, setEquipment] = useState<Set<Equipment>>(new Set(profile.available_equipment));
  const [focus, setFocus] = useState('');
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (equipment.size === 0) { toast.error('Pick at least one equipment'); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/lhfitness/generate-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal, difficulty,
          duration_min: duration,
          equipment: Array.from(equipment),
          focus: focus.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Generator failed');
        setGenerating(false);
        return;
      }
      const data = await res.json();
      toast.success('Workout generated');
      onGenerated(data.workout);
    } catch (e) {
      toast.error('Network error');
      setGenerating(false);
    }
  };

  const allEquipment: Equipment[] = ['bodyweight', 'dumbbells', 'barbell', 'kettlebell', 'pullup_bar', 'bench', 'bands', 'cable', 'machine', 'box', 'rower', 'bike'];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-up">
      <div className="bg-background border-t sm:border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-border flex items-start justify-between sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-foreground font-bold text-xl flex items-center gap-2">
              <Wand2 size={20} className="text-primary" /> Generate workout
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">AI builds a session matched to today's needs.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <Field label="Goal">
            <div className="grid grid-cols-3 gap-1.5">
              {(['strength', 'hypertrophy', 'fat_loss', 'endurance', 'athletic', 'mobility'] as Goal[]).map(g => (
                <button
                  key={g}
                  onClick={() => setGoal(g)}
                  className={cn(
                    'rounded-lg py-2 text-xs font-medium border capitalize',
                    goal === g ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  )}
                >
                  {g.replace('_', ' ')}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Difficulty">
            <div className="grid grid-cols-3 gap-1.5">
              {(['beginner', 'intermediate', 'advanced'] as Difficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    'rounded-lg py-2 text-xs font-medium border capitalize',
                    difficulty === d ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Duration: ${duration} min`}>
            <input
              type="range"
              min={15} max={90} step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>15m</span><span>45m</span><span>90m</span>
            </div>
          </Field>

          <Field label="Available equipment">
            <div className="flex flex-wrap gap-1.5">
              {allEquipment.map(e => (
                <button
                  key={e}
                  onClick={() => {
                    const next = new Set(equipment);
                    if (next.has(e)) next.delete(e); else next.add(e);
                    setEquipment(next);
                  }}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium border capitalize',
                    equipment.has(e) ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  )}
                >
                  {e.replace('_', ' ')}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Focus / what you want today (optional)">
            <input
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. push day, legs, core finisher"
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
            />
          </Field>
        </div>

        <div className="px-6 py-4 border-t border-border flex gap-2 sticky bottom-0 bg-background">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground btn-brand flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {generating ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><Sparkles size={14} /> Generate</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">{label}</label>
      {children}
    </div>
  );
}
