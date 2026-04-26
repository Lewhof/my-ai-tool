'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, Trophy, Plus, Calendar, X, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FitnessState, BodyMetric } from './types';
import { logBodyMetric, sessionsThisWeek } from './store';

interface Props {
  state: FitnessState;
  dispatch: (m: (s: FitnessState) => FitnessState) => void;
}

export default function ProgressView({ state, dispatch }: Props) {
  const [showLog, setShowLog] = useState(false);

  // Sessions per day for the past 30 days (for the activity chart)
  const activity30 = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        count: state.sessions.filter(s => s.started_at.slice(0, 10) === key).length,
      });
    }
    return days;
  }, [state.sessions]);

  // Volume per week for past 8 weeks
  const volumeWeeks = useMemo(() => {
    const weeks: { label: string; volume: number }[] = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(now.getDate() - (i * 7 + 6));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const volume = state.sessions
        .filter(s => {
          const d = new Date(s.started_at);
          return d >= start && d < end;
        })
        .reduce((sum, s) => sum + (s.total_volume_kg || 0), 0);
      weeks.push({
        label: i === 0 ? 'This' : `${i}w`,
        volume,
      });
    }
    return weeks;
  }, [state.sessions]);

  // Weight over time
  const weightSeries = useMemo(() => {
    return state.body_metrics
      .filter(m => m.weight_kg)
      .map(m => ({ date: m.date, value: m.weight_kg! }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [state.body_metrics]);

  const week = sessionsThisWeek(state.sessions);
  const totalVolumeAll = state.sessions.reduce((s, sess) => s + (sess.total_volume_kg || 0), 0);
  const avgRating = state.sessions.filter(s => s.rating).reduce((sum, s, _i, arr) => sum + (s.rating || 0) / arr.length, 0);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Progress</h1>
          <p className="text-muted-foreground text-sm mt-1">Records, volume, body metrics, and trends.</p>
        </div>
        <button
          onClick={() => setShowLog(true)}
          className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 btn-brand"
        >
          <Plus size={16} /> Log body metric
        </button>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigStat label="Total sessions" value={String(state.sessions.length)} sub="all time" />
        <BigStat label="Total volume" value={totalVolumeAll > 1000 ? (totalVolumeAll / 1000).toFixed(1) + 'k' : String(Math.round(totalVolumeAll))} unit="kg" sub="lifetime" />
        <BigStat label="Personal records" value={String(state.prs.length)} sub="across all lifts" />
        <BigStat label="Avg session rating" value={state.sessions.filter(s => s.rating).length ? avgRating.toFixed(1) : '–'} unit="/5" sub="how it felt" />
      </div>

      {/* Activity grid (GitHub-style) */}
      <section>
        <h2 className="text-foreground font-bold text-lg mb-3 flex items-center gap-2">
          <Calendar size={18} className="text-primary" /> Last 30 days
        </h2>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex flex-wrap gap-1.5 justify-center">
            {activity30.map(d => (
              <div
                key={d.date}
                className={cn(
                  'w-8 h-8 rounded',
                  d.count === 0 ? 'bg-secondary/40' :
                  d.count === 1 ? 'bg-primary/40' :
                  d.count === 2 ? 'bg-primary/70' :
                  'bg-primary'
                )}
                title={`${d.date}: ${d.count} session${d.count === 1 ? '' : 's'}`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-4">
            <span>30 days ago</span>
            <div className="flex items-center gap-1.5">
              <span>Less</span>
              <div className="w-2.5 h-2.5 rounded bg-secondary/40" />
              <div className="w-2.5 h-2.5 rounded bg-primary/40" />
              <div className="w-2.5 h-2.5 rounded bg-primary/70" />
              <div className="w-2.5 h-2.5 rounded bg-primary" />
              <span>More</span>
            </div>
            <span>Today</span>
          </div>
        </div>
      </section>

      {/* Volume + weight charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-foreground font-bold text-lg mb-3 flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-400" /> Weekly volume
          </h2>
          <div className="bg-card border border-border rounded-xl p-5">
            <BarChart data={volumeWeeks} unit="kg" />
          </div>
        </section>

        <section>
          <h2 className="text-foreground font-bold text-lg mb-3 flex items-center gap-2">
            <Activity size={18} className="text-blue-400" /> Body weight
          </h2>
          <div className="bg-card border border-border rounded-xl p-5">
            {weightSeries.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground text-sm">No weight data yet.</p>
                <button
                  onClick={() => setShowLog(true)}
                  className="text-primary text-sm font-medium mt-2 hover:underline"
                >
                  Log your first entry
                </button>
              </div>
            ) : (
              <LineChart points={weightSeries} unit="kg" />
            )}
          </div>
        </section>
      </div>

      {/* PRs */}
      <section>
        <h2 className="text-foreground font-bold text-lg mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-yellow-400" /> Personal records
        </h2>
        {state.prs.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <Trophy size={28} className="mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-muted-foreground text-sm">No PRs yet. Hit a personal best in your next session and it'll show up here.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="divide-y divide-border">
              {[...state.prs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map((pr, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center shrink-0">
                    <Trophy size={14} className="text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium truncate">{pr.exercise_name}</p>
                    <p className="text-muted-foreground text-[11px] capitalize">{pr.type.replace('_', ' ')} · {new Date(pr.date).toLocaleDateString()}</p>
                  </div>
                  <p className="text-foreground font-bold tabular-nums">{pr.value}<span className="text-xs text-muted-foreground ml-1">{pr.unit}</span></p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Body metrics history */}
      {state.body_metrics.length > 0 && (
        <section>
          <h2 className="text-foreground font-bold text-lg mb-3">Body metrics</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="divide-y divide-border">
              {[...state.body_metrics].reverse().slice(0, 10).map(m => (
                <div key={m.date} className="px-5 py-3 flex items-center gap-3">
                  <div className="text-muted-foreground text-xs w-24">{new Date(m.date).toLocaleDateString()}</div>
                  <div className="flex-1 flex gap-4 text-sm">
                    {m.weight_kg && <span className="text-foreground tabular-nums">{m.weight_kg}<span className="text-muted-foreground text-xs ml-0.5">kg</span></span>}
                    {m.bf_pct && <span className="text-foreground tabular-nums">{m.bf_pct}<span className="text-muted-foreground text-xs ml-0.5">% bf</span></span>}
                  </div>
                  {m.notes && <span className="text-muted-foreground text-xs italic">{m.notes}</span>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {showLog && (
        <LogMetricModal
          onClose={() => setShowLog(false)}
          onSave={(m) => {
            logBodyMetric(m, dispatch);
            toast.success('Logged');
            setShowLog(false);
          }}
        />
      )}
    </div>
  );
}

function BigStat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex items-baseline gap-1">
        <p className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">{value}</p>
        {unit && <span className="text-muted-foreground text-sm">{unit}</span>}
      </div>
      {sub && <p className="text-muted-foreground text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

function BarChart({ data, unit }: { data: { label: string; volume: number }[]; unit: string }) {
  const max = Math.max(...data.map(d => d.volume), 1);
  return (
    <div className="space-y-2">
      <div className="h-40 flex items-end gap-2">
        {data.map((d, i) => {
          const h = max > 0 ? (d.volume / max) * 100 : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="text-[10px] text-foreground tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                {d.volume > 1000 ? (d.volume / 1000).toFixed(1) + 'k' : Math.round(d.volume)}
              </div>
              <div
                className={cn('w-full rounded-t transition-all min-h-[2px]', d.volume > 0 ? 'bg-primary' : 'bg-secondary')}
                style={{ height: `${Math.max(2, h)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-muted-foreground">{d.label}</div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ points, unit }: { points: { date: string; value: number }[]; unit: string }) {
  if (points.length < 2) {
    return (
      <div className="text-center py-6">
        <p className="text-foreground text-2xl font-bold tabular-nums">{points[0].value}<span className="text-sm text-muted-foreground ml-1">{unit}</span></p>
        <p className="text-muted-foreground text-xs">Log more entries to see a trend</p>
      </div>
    );
  }
  const width = 320;
  const height = 140;
  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.value - min) / range) * height;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  const latest = points[points.length - 1];
  const earliest = points[0];
  const change = latest.value - earliest.value;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-2xl font-bold text-foreground tabular-nums">{latest.value}<span className="text-sm text-muted-foreground ml-1">{unit}</span></p>
        <p className={cn('text-sm font-medium', change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : 'text-muted-foreground')}>
          {change > 0 ? '+' : ''}{change.toFixed(1)} {unit}
        </p>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
        <path d={areaPath} fill="var(--color-primary)" fillOpacity="0.15" />
        <path d={path} stroke="var(--color-primary)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          const x = (i / (points.length - 1)) * width;
          const y = height - ((p.value - min) / range) * height;
          return <circle key={i} cx={x} cy={y} r="2" fill="var(--color-primary)" />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
        <span>{new Date(earliest.date).toLocaleDateString()}</span>
        <span>{new Date(latest.date).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

function LogMetricModal({ onClose, onSave }: { onClose: () => void; onSave: (m: BodyMetric) => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState('');
  const [bf, setBf] = useState('');
  const [notes, setNotes] = useState('');

  const save = () => {
    if (!weight && !bf) { toast.error('Enter at least one value'); return; }
    onSave({
      date,
      weight_kg: weight ? Number(weight) : undefined,
      bf_pct: bf ? Number(bf) : undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-up">
      <div className="bg-background border-t sm:border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-foreground font-bold text-xl">Log body metric</h3>
            <p className="text-muted-foreground text-sm mt-0.5">Record weight, body fat, or both.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-primary/60 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Weight (kg)</label>
              <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="80.5"
                className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none" />
            </div>
            <div>
              <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Body fat (%)</label>
              <input type="number" step="0.1" value={bf} onChange={(e) => setBf(e.target.value)} placeholder="15.2"
                className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Felt lean, post-workout, etc."
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none" />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary">Cancel</button>
          <button onClick={save} className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground btn-brand">Save</button>
        </div>
      </div>
    </div>
  );
}
