'use client';

import { useMemo } from 'react';
import { Flame, TrendingUp, Calendar, Trophy, Play, Sparkles, Dumbbell, Clock, ArrowRight, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FitnessState, Workout, ScheduledSession, ImportedWorkout, Session } from './types';
import { streakDays, sessionsThisWeek, totalVolumeThisWeek, getActivePlan } from './store';

interface Props {
  state: FitnessState;
  onStartWorkout: (workout: Workout, scheduledId?: string) => void;
  onNavigate: (view: string) => void;
}

export default function TodayView({ state, onStartWorkout, onNavigate }: Props) {
  const { profile, workouts, sessions, prs } = state;
  if (!profile) return null;

  const streak = streakDays(sessions);
  const week = sessionsThisWeek(sessions);
  // Imports this week — Garmin/external activities also count toward target
  const weekImports = importsThisWeek(state.imported_workouts);
  const weekTotalActivities = week.length + weekImports.length;
  const weekProgress = Math.min(100, Math.round((weekTotalActivities / profile.weekly_target) * 100));
  const volumeWeek = totalVolumeThisWeek(sessions);
  const runningKmWeek = weekImports
    .filter(i => /run|jog/i.test(i.type) && i.distance_km)
    .reduce((s, i) => s + (i.distance_km || 0), 0);

  // Today's scheduled session takes priority over the auto-recommendation
  const today = new Date().toISOString().slice(0, 10);
  const scheduledToday = state.scheduled_sessions.find(
    s => s.date === today && s.status === 'scheduled'
  );
  const scheduledWorkout = scheduledToday?.workout_id
    ? state.workouts.find(w => w.id === scheduledToday.workout_id)
    : undefined;
  const activePlan = getActivePlan(state);

  // Pick a recommended workout for today (fallback when nothing scheduled)
  const recommended = useMemo(() => pickRecommended(state), [state]);
  const featuredWorkout = scheduledWorkout || recommended;
  const featuredScheduledId = scheduledWorkout ? scheduledToday?.id : undefined;
  const featuredFromPlan = !!scheduledWorkout && !!scheduledToday;

  const greeting = getGreeting();
  const motivational = getMotivationalLine(streak, weekTotalActivities, profile.weekly_target);

  // Recent PRs (last 14 days)
  const recentPrs = prs
    .filter(p => Date.now() - new Date(p.date).getTime() < 14 * 24 * 60 * 60 * 1000)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  return (
    <div className="space-y-8 pb-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="relative">
          <p className="text-muted-foreground text-sm">{greeting}, {profile.name}</p>
          <h1 className="text-3xl sm:text-4xl font-bold mt-1 text-foreground tracking-tight">{motivational.headline}</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-lg">{motivational.sub}</p>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={<Flame className="text-orange-400" size={18} />}
          label="Streak"
          value={String(streak)}
          unit={streak === 1 ? 'day' : 'days'}
          accent={streak >= 3}
        />
        <StatTile
          icon={<Calendar className="text-blue-400" size={18} />}
          label="This week"
          value={`${weekTotalActivities}`}
          unit={`/ ${profile.weekly_target}`}
          progress={weekProgress}
        />
        <StatTile
          icon={<TrendingUp className="text-emerald-400" size={18} />}
          label={runningKmWeek > 0 ? 'Run / Vol' : 'Volume'}
          value={runningKmWeek > 0
            ? `${runningKmWeek.toFixed(1)}km`
            : (volumeWeek > 1000 ? (volumeWeek / 1000).toFixed(1) + 'k' : String(Math.round(volumeWeek)))}
          unit={runningKmWeek > 0 ? '+ lifts' : 'kg'}
        />
        <StatTile
          icon={<Trophy className="text-yellow-400" size={18} />}
          label="Total PRs"
          value={String(prs.length)}
          unit={prs.length === 1 ? 'record' : 'records'}
        />
      </div>

      {/* Today's workout — big card (scheduled from plan if exists, else recommended) */}
      {featuredWorkout && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-foreground font-bold text-lg">Today's session</h2>
            <button
              onClick={() => onNavigate(featuredFromPlan ? 'plan' : 'library')}
              className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1"
            >
              {featuredFromPlan ? 'Open plan' : 'Browse library'} <ArrowRight size={12} />
            </button>
          </div>
          <button
            onClick={() => onStartWorkout(featuredWorkout, featuredScheduledId)}
            className="w-full text-left group bg-card hover:bg-card/80 border border-border hover:border-primary/40 rounded-2xl p-5 sm:p-6 transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                <Dumbbell className="text-primary" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {featuredFromPlan ? (
                    <>
                      <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">From your plan</span>
                      {activePlan && (
                        <>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground truncate">{activePlan.name}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">Recommended</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground capitalize">{featuredWorkout.goal.replace('_', ' ')}</span>
                </div>
                <h3 className="text-foreground font-bold text-xl">{featuredWorkout.name}</h3>
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{featuredWorkout.description}</p>
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock size={12} /> {featuredWorkout.duration_min} min</span>
                  <span className="flex items-center gap-1"><Dumbbell size={12} /> {featuredWorkout.exercises.length} exercises</span>
                  <span className="capitalize">{featuredWorkout.difficulty}</span>
                </div>
              </div>
              <div className="hidden sm:flex w-12 h-12 rounded-full bg-primary text-primary-foreground items-center justify-center shrink-0 group-hover:shadow-[0_0_24px_var(--brand-glow)] transition-shadow">
                <Play size={18} className="ml-0.5" fill="currentColor" />
              </div>
            </div>
          </button>

          {scheduledToday && !scheduledWorkout && (
            <div className="mt-3 text-center">
              <button
                onClick={() => onNavigate('plan')}
                className="text-xs text-primary hover:underline"
              >
                Today's plan slot needs a workout · open plan
              </button>
            </div>
          )}
        </section>
      )}

      {/* Two columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent PRs */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-foreground font-bold text-lg flex items-center gap-2">
              <Trophy size={18} className="text-yellow-400" /> Recent PRs
            </h2>
            <button
              onClick={() => onNavigate('progress')}
              className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1"
            >
              All <ArrowRight size={12} />
            </button>
          </div>
          {recentPrs.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <Trophy size={24} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-muted-foreground text-sm">No PRs yet. Hit a personal best in your next session and it'll show up here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentPrs.map((pr, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-yellow-500/15 flex items-center justify-center shrink-0">
                    <Trophy size={16} className="text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium truncate">{pr.exercise_name}</p>
                    <p className="text-muted-foreground text-[11px] capitalize">{pr.type.replace('_', ' ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-foreground font-bold tabular-nums">{pr.value}<span className="text-xs text-muted-foreground ml-1">{pr.unit}</span></p>
                    <p className="text-muted-foreground text-[10px]">{new Date(pr.date).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick actions */}
        <section>
          <h2 className="text-foreground font-bold text-lg mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <ActionTile
              icon={<Brain size={18} className="text-primary" />}
              label={activePlan ? 'Open plan' : 'Build a plan'}
              sub={activePlan ? `${activePlan.weeks.length}-week block` : 'AI coach roadmaps it'}
              onClick={() => onNavigate(activePlan ? 'plan' : 'coach')}
            />
            <ActionTile
              icon={<Dumbbell size={18} className="text-blue-400" />}
              label="Browse library"
              sub={`${workouts.length} workouts ready`}
              onClick={() => onNavigate('library')}
            />
            <ActionTile
              icon={<TrendingUp size={18} className="text-emerald-400" />}
              label="Log body metric"
              sub="Weight, body fat, etc."
              onClick={() => onNavigate('progress')}
            />
            <ActionTile
              icon={<Sparkles size={18} className="text-yellow-400" />}
              label="Ask coach"
              sub="Form, programming, advice"
              onClick={() => onNavigate('coach')}
            />
          </div>
        </section>
      </div>

      {/* Recent activity — unified feed of in-app sessions + Garmin/external imports */}
      {(sessions.length > 0 || state.imported_workouts.length > 0) && (
        <section>
          <h2 className="text-foreground font-bold text-lg mb-3">Recent activity</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="divide-y divide-border">
              {mergeRecentActivity(sessions, state.imported_workouts).slice(0, 6).map(item => (
                <div key={item.kind + ':' + item.id} className="px-4 py-3 flex items-center gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    item.kind === 'session' ? 'bg-primary/10' : 'bg-blue-500/10'
                  )}>
                    {item.kind === 'session'
                      ? <Dumbbell size={14} className="text-primary" />
                      : <span className="text-blue-400 text-[10px] font-bold">EXT</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium truncate">{item.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(item.date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {item.duration_min ? ` · ${item.duration_min} min` : ''}
                      {item.distance_km ? ` · ${item.distance_km.toFixed(2)}km` : ''}
                    </p>
                  </div>
                  {item.right_value && (
                    <div className="text-right">
                      <p className="text-foreground text-sm font-bold tabular-nums">{item.right_value}</p>
                      <p className="text-muted-foreground text-[10px]">{item.right_label}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StatTile({
  icon, label, value, unit, accent, progress,
}: {
  icon: React.ReactNode; label: string; value: string; unit?: string;
  accent?: boolean; progress?: number;
}) {
  return (
    <div className={cn(
      'bg-card border rounded-xl p-4 relative overflow-hidden',
      accent ? 'border-orange-500/40 shadow-[0_0_20px_rgb(251_146_60_/_0.15)]' : 'border-border'
    )}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <p className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">{value}</p>
        {unit && <span className="text-muted-foreground text-xs">{unit}</span>}
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function ActionTile({
  icon, label, sub, onClick,
}: {
  icon: React.ReactNode; label: string; sub: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-card hover:bg-card/80 border border-border hover:border-primary/40 rounded-xl p-4 text-left transition-all group"
    >
      <div className="mb-2">{icon}</div>
      <p className="text-foreground font-bold text-sm">{label}</p>
      <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>
    </button>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getMotivationalLine(streak: number, weekCount: number, target: number): { headline: string; sub: string } {
  if (streak >= 7) return { headline: `${streak}-day streak. You're locked in.`, sub: 'Consistency beats intensity. Show up again today.' };
  if (streak >= 3) return { headline: 'Momentum building.', sub: `${streak} days running. Don't break the chain.` };
  if (weekCount >= target) return { headline: 'Weekly target hit.', sub: 'Anything from here is a bonus. Train smart.' };
  if (weekCount > 0) return { headline: `${weekCount}/${target} sessions this week.`, sub: `${target - weekCount} to go. You've got this.` };
  return { headline: 'Time to get to work.', sub: 'Start today, build the habit, change the trajectory.' };
}

// Imports landing in the last 7 days (rolling window matching sessionsThisWeek)
function importsThisWeek(imports: ImportedWorkout[]): ImportedWorkout[] {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return imports.filter(i => new Date(i.date) >= start);
}

interface ActivityItem {
  id: string;
  kind: 'session' | 'import';
  date: string;
  name: string;
  duration_min?: number;
  distance_km?: number;
  right_value?: string;
  right_label?: string;
}

function mergeRecentActivity(sessions: Session[], imports: ImportedWorkout[]): ActivityItem[] {
  const sessionItems: ActivityItem[] = sessions.map(s => ({
    id: s.id,
    kind: 'session',
    date: s.started_at,
    name: s.workout_name,
    duration_min: s.duration_seconds ? Math.round(s.duration_seconds / 60) : undefined,
    right_value: s.total_volume_kg && s.total_volume_kg > 0
      ? `${Math.round(s.total_volume_kg)}kg`
      : undefined,
    right_label: s.total_volume_kg && s.total_volume_kg > 0 ? 'volume' : undefined,
  }));
  const importItems: ActivityItem[] = imports.map(i => ({
    id: i.id,
    kind: 'import',
    date: i.date,
    name: i.name || i.type,
    duration_min: i.duration_seconds ? Math.round(i.duration_seconds / 60) : undefined,
    distance_km: i.distance_km,
    right_value: i.calories ? `${i.calories}` : i.avg_hr ? `${i.avg_hr}` : undefined,
    right_label: i.calories ? 'kcal' : i.avg_hr ? 'avg bpm' : undefined,
  }));
  return [...sessionItems, ...importItems].sort((a, b) => b.date.localeCompare(a.date));
}

function pickRecommended(state: FitnessState): Workout | undefined {
  const { workouts, profile, sessions } = state;
  if (!profile || workouts.length === 0) return undefined;

  // Skip workouts done in the last 2 days (avoid same-day repeat for muscle recovery)
  const recentIds = new Set(
    sessions
      .filter(s => Date.now() - new Date(s.started_at).getTime() < 2 * 24 * 60 * 60 * 1000)
      .map(s => s.workout_id)
  );

  // Prefer workouts matching any of the user's goals
  const candidates = workouts.filter(w => !recentIds.has(w.id));
  const pool = candidates.length > 0 ? candidates : workouts;

  const goalSet = new Set(profile.goals);
  const goalMatch = pool.filter(w => goalSet.has(w.goal));
  const finalPool = goalMatch.length > 0 ? goalMatch : pool;

  // For hybrid users, rotate through goals to balance training
  // Pick the goal that's been least-trained recently
  if (profile.goals.length > 1 && goalMatch.length > 0) {
    const goalCounts = new Map<string, number>();
    profile.goals.forEach(g => goalCounts.set(g, 0));
    sessions.slice(0, 10).forEach(s => {
      const w = workouts.find(w => w.id === s.workout_id);
      if (w && goalCounts.has(w.goal)) {
        goalCounts.set(w.goal, (goalCounts.get(w.goal) || 0) + 1);
      }
    });
    const leastTrained = [...goalCounts.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
    if (leastTrained) {
      const leastMatch = goalMatch.find(w => w.goal === leastTrained);
      if (leastMatch) return leastMatch;
    }
  }

  return finalPool[0];
}
