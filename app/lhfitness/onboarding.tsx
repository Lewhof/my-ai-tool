'use client';

import { useState } from 'react';
import { ArrowRight, Dumbbell, Target, Calendar, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Profile, Goal, Difficulty, Equipment } from './types';

const GOALS: Array<{ id: Goal; label: string; sub: string; emoji: string }> = [
  { id: 'strength', label: 'Get Stronger', sub: 'Heavier weights, lower reps', emoji: '🏋️' },
  { id: 'hypertrophy', label: 'Build Muscle', sub: 'Size, shape, the look', emoji: '💪' },
  { id: 'fat_loss', label: 'Lose Fat', sub: 'Conditioning, calorie burn', emoji: '🔥' },
  { id: 'endurance', label: 'Endurance', sub: 'Run further, last longer', emoji: '🏃' },
  { id: 'athletic', label: 'Athletic', sub: 'Power, speed, sport', emoji: '⚡' },
  { id: 'mobility', label: 'Mobility', sub: 'Move better, hurt less', emoji: '🧘' },
];

const LEVELS: Array<{ id: Difficulty; label: string; sub: string }> = [
  { id: 'beginner', label: 'Beginner', sub: 'New to training, or returning' },
  { id: 'intermediate', label: 'Intermediate', sub: 'Train regularly, know the basics' },
  { id: 'advanced', label: 'Advanced', sub: 'Years of experience, push hard' },
];

const EQUIPMENT_OPTIONS: Array<{ id: Equipment; label: string }> = [
  { id: 'bodyweight', label: 'Bodyweight only' },
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'barbell', label: 'Barbell' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'pullup_bar', label: 'Pull-up bar' },
  { id: 'bench', label: 'Bench' },
  { id: 'bands', label: 'Resistance bands' },
  { id: 'cable', label: 'Cable / pulley' },
  { id: 'machine', label: 'Machines' },
  { id: 'rower', label: 'Rower' },
  { id: 'bike', label: 'Stationary bike' },
];

interface Props {
  onComplete: (profile: Profile) => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [goals, setGoals] = useState<Set<Goal>>(new Set());
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [equipment, setEquipment] = useState<Set<Equipment>>(new Set(['bodyweight']));
  const [weeklyTarget, setWeeklyTarget] = useState(4);
  const [weight, setWeight] = useState('');

  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && goals.size > 0) ||
    (step === 2 && difficulty) ||
    (step === 3 && equipment.size > 0) ||
    (step === 4);

  const next = () => {
    if (step < 4) { setStep(step + 1); return; }
    if (goals.size === 0 || !difficulty) return;
    const profile: Profile = {
      name: name.trim(),
      goals: Array.from(goals),
      difficulty,
      available_equipment: Array.from(equipment),
      weekly_target: weeklyTarget,
      weight_kg: weight ? Number(weight) : undefined,
      created_at: new Date().toISOString(),
    };
    onComplete(profile);
  };

  const toggleGoal = (g: Goal) => {
    setGoals(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const allGoals: Goal[] = ['strength', 'hypertrophy', 'fat_loss', 'endurance', 'athletic', 'mobility'];
  const allSelected = goals.size === allGoals.length;

  const toggleEquipment = (id: Equipment) => {
    setEquipment(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 lhfit-onboarding">
      <div className="w-full max-w-xl">
        {/* Progress bar */}
        <div className="flex gap-1.5 mb-10">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= step ? 'bg-primary' : 'bg-border'
              )}
            />
          ))}
        </div>

        <div key={step} className="animate-fade-up">
          {step === 0 && (
            <Step
              icon={<Dumbbell size={28} className="text-primary" />}
              title="Welcome to LH Fitness"
              subtitle="Your AI trainer. Let's set things up — takes 30 seconds."
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should I call you?"
                autoFocus
                className="w-full bg-card border border-border rounded-xl px-5 py-4 text-lg text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && canContinue && next()}
              />
            </Step>
          )}

          {step === 1 && (
            <Step
              icon={<Target size={28} className="text-primary" />}
              title="What are your goals?"
              subtitle="Pick one or more — go full hybrid if you want it all."
            >
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setGoals(allSelected ? new Set() : new Set(allGoals))}
                  className={cn(
                    'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors',
                    allSelected
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
                  )}
                >
                  {allSelected ? 'Clear all' : 'Hybrid (pick all)'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {GOALS.map(g => {
                  const selected = goals.has(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleGoal(g.id)}
                      className={cn(
                        'text-left rounded-xl p-4 border-2 transition-all relative',
                        selected
                          ? 'border-primary bg-primary/10 shadow-[0_0_24px_var(--brand-glow)]'
                          : 'border-border bg-card hover:border-primary/40'
                      )}
                    >
                      {selected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                          ✓
                        </div>
                      )}
                      <div className="text-2xl mb-1.5">{g.emoji}</div>
                      <div className="text-foreground font-bold text-sm">{g.label}</div>
                      <div className="text-muted-foreground text-xs mt-0.5">{g.sub}</div>
                    </button>
                  );
                })}
              </div>
              {goals.size > 0 && (
                <p className="text-muted-foreground text-xs mt-3 text-center">
                  {goals.size} selected · {goals.size === allGoals.length ? 'Full hybrid mode' : `${goals.size === 1 ? 'Focused' : 'Hybrid'} training`}
                </p>
              )}
            </Step>
          )}

          {step === 2 && (
            <Step
              icon={<Dumbbell size={28} className="text-primary" />}
              title="What's your level?"
              subtitle="Be honest — this calibrates volume and intensity."
            >
              <div className="space-y-2">
                {LEVELS.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setDifficulty(l.id)}
                    className={cn(
                      'w-full text-left rounded-xl p-4 border-2 transition-all flex items-center justify-between',
                      difficulty === l.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card hover:border-primary/40'
                    )}
                  >
                    <div>
                      <div className="text-foreground font-bold">{l.label}</div>
                      <div className="text-muted-foreground text-sm">{l.sub}</div>
                    </div>
                    {difficulty === l.id && <div className="w-2 h-2 rounded-full bg-primary status-dot-orange" />}
                  </button>
                ))}
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step
              icon={<Wrench size={28} className="text-primary" />}
              title="What equipment do you have?"
              subtitle="Pick all that apply. We'll only suggest workouts you can actually do."
            >
              <div className="grid grid-cols-2 gap-2">
                {EQUIPMENT_OPTIONS.map(e => (
                  <button
                    key={e.id}
                    onClick={() => toggleEquipment(e.id)}
                    className={cn(
                      'text-left rounded-lg px-4 py-3 border-2 text-sm font-medium transition-all',
                      equipment.has(e.id)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-foreground hover:border-primary/40'
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </Step>
          )}

          {step === 4 && (
            <Step
              icon={<Calendar size={28} className="text-primary" />}
              title="A few last details"
              subtitle="Weight is optional — useful for volume tracking and PRs."
            >
              <div className="space-y-5">
                <div>
                  <label className="text-muted-foreground text-xs uppercase tracking-wide block mb-2">
                    Sessions per week (target)
                  </label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7].map(n => (
                      <button
                        key={n}
                        onClick={() => setWeeklyTarget(n)}
                        className={cn(
                          'aspect-square rounded-lg font-bold text-lg transition-all',
                          weeklyTarget === n
                            ? 'bg-primary text-primary-foreground shadow-[0_0_18px_var(--brand-glow)]'
                            : 'bg-card border border-border text-foreground hover:border-primary/40'
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-muted-foreground text-xs uppercase tracking-wide block mb-2">
                    Body weight (optional)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.1"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="80"
                      className="flex-1 bg-card border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
                    />
                    <span className="text-muted-foreground text-sm">kg</span>
                  </div>
                </div>
              </div>
            </Step>
          )}
        </div>

        <div className="flex items-center justify-between mt-10">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="text-muted-foreground hover:text-foreground text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            onClick={next}
            disabled={!canContinue}
            className={cn(
              'flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all',
              canContinue
                ? 'bg-primary text-primary-foreground btn-brand'
                : 'bg-card text-muted-foreground cursor-not-allowed'
            )}
          >
            {step === 4 ? 'Start training' : 'Continue'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        </div>
      </div>
      <p className="text-muted-foreground text-sm mb-6 ml-15">{subtitle}</p>
      <div>{children}</div>
    </div>
  );
}
