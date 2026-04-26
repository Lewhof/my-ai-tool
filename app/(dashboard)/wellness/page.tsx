'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Activity, Heart, Moon, Zap, Footprints, Dumbbell, Plus, TrendingUp, Sparkles, Trash2, Timer, Flame, Target, Calendar, Beef, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import NutritionTab from '@/components/wellness/nutrition-tab';

type TrendPoint = { date: string; value: number };
type TodayEntry = { value: number | null; unit: string | null; date: string; source: string };
type Workout = { date: string; source: string; name?: string; duration_min?: number; distance_km?: number; calories?: number };

type Summary = {
  today: Record<string, TodayEntry>;
  trends: Record<string, TrendPoint[]>;
  workouts: Workout[];
  sources: string[];
  total_entries: number;
};

// Simple inline SVG sparkline — no chart library dependency
function Sparkline({ points, color = '#a78bfa', height = 40 }: { points: TrendPoint[]; color?: string; height?: number }) {
  if (!points || points.length < 2) {
    return <div className="text-muted-foreground/40 text-[10px] italic">Not enough data</div>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 140;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.value - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
  // Area fill
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={areaPath} fill={color} fillOpacity="0.12" />
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => {
        const x = (i / (points.length - 1)) * width;
        const y = height - ((p.value - min) / range) * height;
        return <circle key={i} cx={x} cy={y} r="1.2" fill={color} />;
      })}
    </svg>
  );
}

const METRIC_META: Record<string, { label: string; icon: typeof Activity; color: string; unit: string; formatter?: (v: number) => string }> = {
  steps:         { label: 'Steps',          icon: Footprints, color: 'text-blue-400',    unit: 'steps', formatter: (v) => v.toLocaleString() },
  sleep_hours:   { label: 'Sleep',          icon: Moon,       color: 'text-indigo-400',  unit: 'h', formatter: (v) => `${v.toFixed(1)}h` },
  resting_hr:    { label: 'Resting HR',     icon: Heart,      color: 'text-red-400',     unit: 'bpm', formatter: (v) => `${Math.round(v)} bpm` },
  body_battery:  { label: 'Body Battery',   icon: Zap,        color: 'text-yellow-400',  unit: '/100', formatter: (v) => `${Math.round(v)}` },
  stress:        { label: 'Stress',         icon: Activity,   color: 'text-orange-400',  unit: '/100', formatter: (v) => `${Math.round(v)}` },
  weight:        { label: 'Weight',         icon: TrendingUp, color: 'text-green-400',   unit: 'kg', formatter: (v) => `${v.toFixed(1)} kg` },
};

const METRIC_ORDER = ['steps', 'sleep_hours', 'resting_hr', 'body_battery', 'stress', 'weight'];

function generateDemoData() {
  // 30 days of plausible biometric data
  const today = new Date();
  const metrics: Array<{ date: string; metric: string; value: number; unit: string }> = [];
  for (let d = 29; d >= 0; d--) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - d);
    const date = dt.toISOString().slice(0, 10);
    metrics.push({ date, metric: 'steps', value: 6000 + Math.floor(Math.random() * 8000), unit: 'steps' });
    metrics.push({ date, metric: 'sleep_hours', value: Math.round((6 + Math.random() * 2.5) * 10) / 10, unit: 'h' });
    metrics.push({ date, metric: 'resting_hr', value: 52 + Math.floor(Math.random() * 8), unit: 'bpm' });
    metrics.push({ date, metric: 'body_battery', value: 45 + Math.floor(Math.random() * 50), unit: '/100' });
    metrics.push({ date, metric: 'stress', value: 20 + Math.floor(Math.random() * 40), unit: '/100' });
    if (d % 3 === 0) metrics.push({ date, metric: 'weight', value: 82 + Math.random() * 2 - 1, unit: 'kg' });
  }
  return metrics;
}

type WellnessTab = 'biometrics' | 'training' | 'nutrition';

// ═══════════════════════════════════════════════
// TRAINING TAB (Placeholder)
// ═══════════════════════════════════════════════
function TrainingTab() {
  const [activities, setActivities] = useState<Array<{
    id: string;
    date: string;
    type: string;
    name: string;
    duration_min: number;
    notes: string;
    intensity: 'low' | 'medium' | 'high';
  }>>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState('gym');
  const [newName, setNewName] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newIntensity, setNewIntensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const TRAINING_TYPES = [
    { id: 'gym', label: 'Gym / Weights', icon: Dumbbell },
    { id: 'cardio', label: 'Cardio / Run', icon: Footprints },
    { id: 'hiit', label: 'HIIT', icon: Flame },
    { id: 'martial_arts', label: 'Martial Arts / MMA', icon: Target },
    { id: 'sport', label: 'Sport', icon: Activity },
    { id: 'recovery', label: 'Recovery / Stretch', icon: Heart },
    { id: 'other', label: 'Other', icon: Timer },
  ];

  useEffect(() => {
    fetch('/api/wellness/training')
      .then(r => r.ok ? r.json() : { activities: [] })
      .then(d => setActivities(d.activities ?? []))
      .catch(() => {});
  }, []);

  const addActivity = async () => {
    if (!newName.trim() || !newDuration) return;
    setSaving(true);
    try {
      const res = await fetch('/api/wellness/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newType,
          name: newName,
          duration_min: parseInt(newDuration),
          intensity: newIntensity,
          notes: newNotes,
          date: new Date().toISOString().slice(0, 10),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setActivities(prev => [data.activity, ...prev]);
        setNewName(''); setNewDuration(''); setNewNotes('');
        setShowAdd(false);
        toast.success('Activity logged');
      }
    } catch {
      toast.error('Failed to log activity');
    }
    setSaving(false);
  };

  // Stats for the week
  const thisWeek = activities.filter(a => {
    const d = new Date(a.date);
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  });
  const totalMinutes = thisWeek.reduce((s, a) => s + (a.duration_min || 0), 0);

  return (
    <div className="space-y-6">
      {/* Weekly summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-primary" />
            <span className="text-muted-foreground text-xs">This week</span>
          </div>
          <p className="text-foreground text-2xl font-bold">{thisWeek.length}</p>
          <p className="text-muted-foreground text-[10px]">sessions</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Timer size={14} className="text-blue-400" />
            <span className="text-muted-foreground text-xs">Duration</span>
          </div>
          <p className="text-foreground text-2xl font-bold">{Math.round(totalMinutes / 60 * 10) / 10}h</p>
          <p className="text-muted-foreground text-[10px]">{totalMinutes} min total</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={14} className="text-orange-400" />
            <span className="text-muted-foreground text-xs">Intensity</span>
          </div>
          <p className="text-foreground text-2xl font-bold">
            {thisWeek.length > 0 ? (thisWeek.filter(a => a.intensity === 'high').length > thisWeek.length / 2 ? 'High' : 'Medium') : '—'}
          </p>
          <p className="text-muted-foreground text-[10px]">avg this week</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-green-400" />
            <span className="text-muted-foreground text-xs">Streak</span>
          </div>
          <p className="text-foreground text-2xl font-bold">—</p>
          <p className="text-muted-foreground text-[10px]">coming soon</p>
        </div>
      </div>

      {/* Log button + form */}
      <div className="flex items-center justify-between">
        <h3 className="text-foreground font-semibold text-sm">Training Log</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 bg-primary text-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={12} /> Log session
        </button>
      </div>

      {showAdd && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TRAINING_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setNewType(t.id)}
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-lg border text-[12px] font-medium transition-colors',
                    newType === t.id
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-muted-foreground text-[11px] block mb-1">Activity name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Push day, 5km run, BJJ class"
                className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40"
              />
            </div>
            <div className="w-24">
              <label className="text-muted-foreground text-[11px] block mb-1">Duration (min)</label>
              <input
                type="number"
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value)}
                placeholder="60"
                className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-[11px] block mb-1">Intensity</label>
              <div className="flex gap-1">
                {(['low', 'medium', 'high'] as const).map(i => (
                  <button
                    key={i}
                    onClick={() => setNewIntensity(i)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors capitalize',
                      newIntensity === i
                        ? i === 'high' ? 'border-red-500/50 bg-red-500/10 text-red-400'
                          : i === 'medium' ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                          : 'border-green-500/50 bg-green-500/10 text-green-400'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-muted-foreground text-[11px] block mb-1">Notes (optional)</label>
            <input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="PR, felt great, etc."
              className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground text-xs px-3 py-1.5">Cancel</button>
            <button
              onClick={addActivity}
              disabled={saving || !newName.trim() || !newDuration}
              className="bg-primary text-foreground px-4 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Log activity'}
            </button>
          </div>
        </div>
      )}

      {/* Activity list */}
      {activities.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center space-y-3">
          <Dumbbell size={36} className="mx-auto text-muted-foreground/40" />
          <div>
            <p className="text-foreground font-semibold">No training sessions logged</p>
            <p className="text-muted-foreground text-sm mt-1">Log your first workout to start tracking your training.</p>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="divide-y divide-border">
            {activities.slice(0, 20).map((a) => {
              const typeInfo = TRAINING_TYPES.find(t => t.id === a.type) || TRAINING_TYPES[6];
              const Icon = typeInfo.icon;
              return (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 shrink-0">
                    <Icon size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium truncate">{a.name}</p>
                    <p className="text-muted-foreground text-[11px]">
                      {new Date(a.date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {a.duration_min ? ` · ${a.duration_min}min` : ''}
                      {a.notes ? ` · ${a.notes}` : ''}
                    </p>
                  </div>
                  <span className={cn(
                    'text-[10px] font-medium px-2 py-0.5 rounded-full capitalize',
                    a.intensity === 'high' ? 'bg-red-500/15 text-red-400'
                      : a.intensity === 'medium' ? 'bg-yellow-500/15 text-yellow-400'
                      : 'bg-green-500/15 text-green-400'
                  )}>
                    {a.intensity}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WellnessPage() {
  const [tab, setTab] = useState<WellnessTab>('biometrics');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newMetric, setNewMetric] = useState('steps');
  const [newValue, setNewValue] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wellness/summary');
      const data = await res.json();
      setSummary(data);
    } catch {
      toast.error('Failed to load wellness data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seedDemo = async () => {
    const metrics = generateDemoData();
    const res = await fetch('/api/wellness/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'demo', metrics }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Seeded ${data.ingested} demo metrics`);
      load();
    } else {
      toast.error(data.error || 'Failed');
    }
  };

  const clearDemo = async () => {
    if (!confirm('Clear all demo data?')) return;
    const res = await fetch('/api/wellness/ingest?source=demo', { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Cleared ${data.deleted} demo entries`);
      load();
    } else {
      toast.error(data.error || 'Failed');
    }
  };

  const addManual = async () => {
    if (!newValue) return;
    const meta = METRIC_META[newMetric];
    const res = await fetch('/api/wellness/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        metrics: [{ date: newDate, metric: newMetric, value: parseFloat(newValue), unit: meta?.unit || '' }],
      }),
    });
    if (res.ok) {
      toast.success(`${meta?.label || newMetric} logged`);
      setNewValue('');
      setShowAdd(false);
      load();
    } else {
      toast.error('Failed to log');
    }
  };

  const hasData = summary && summary.total_entries > 0;
  const hasDemoData = summary?.sources.includes('demo') ?? false;

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity size={22} className="text-primary" /> Wellness
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Biometrics, training & recovery tracking</p>
        </div>
        {tab === 'biometrics' && (
          <div className="flex gap-2">
            <button onClick={() => setShowAdd((v) => !v)} className="bg-primary text-foreground px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors">
              <Plus size={12} /> Log manual
            </button>
            {!hasDemoData ? (
              <button onClick={seedDemo} className="text-muted-foreground hover:text-foreground text-xs px-3 py-1.5 border border-border rounded-lg flex items-center gap-2 transition-colors">
                <Sparkles size={12} /> Seed demo data
              </button>
            ) : (
              <button onClick={clearDemo} className="text-muted-foreground hover:text-red-400 text-xs px-3 py-1.5 border border-border rounded-lg flex items-center gap-2 transition-colors">
                <Trash2 size={12} /> Clear demo
              </button>
            )}
          </div>
        )}
      </div>

      {/* LH Fitness app — featured launcher */}
      <Link
        href="/lhfitness"
        className="group relative block overflow-hidden rounded-2xl border border-border hover:border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card p-5 sm:p-6 transition-all"
      >
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4 sm:gap-5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary flex items-center justify-center shrink-0 shadow-[0_0_24px_var(--brand-glow)]">
            <Zap size={22} className="text-primary-foreground" fill="currentColor" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold bg-primary/15 px-1.5 py-0.5 rounded">New</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">AI Trainer</span>
            </div>
            <h3 className="text-foreground font-bold text-lg sm:text-xl">LH Fitness</h3>
            <p className="text-muted-foreground text-sm mt-0.5 max-w-md">
              Full training app — AI-generated workouts, live session tracking, PRs, and a personal coach.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-primary text-sm font-bold whitespace-nowrap group-hover:translate-x-1 transition-transform">
            Open <ArrowRight size={14} />
          </div>
          <ArrowRight className="sm:hidden text-primary" size={18} />
        </div>
      </Link>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        {([
          { id: 'biometrics' as const, label: 'Biometrics', icon: Heart },
          { id: 'training' as const, label: 'Training', icon: Dumbbell },
          { id: 'nutrition' as const, label: 'Nutrition', icon: Beef },
        ]).map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'training' && <TrainingTab />}

      {tab === 'nutrition' && <NutritionTab />}

      {tab === 'biometrics' && <>
      {/* Manual add form */}
      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-foreground font-semibold text-sm">Log a metric</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-muted-foreground text-[11px] block mb-1">Metric</label>
              <select value={newMetric} onChange={(e) => setNewMetric(e.target.value)} className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground">
                {METRIC_ORDER.map((m) => (
                  <option key={m} value={m}>{METRIC_META[m]?.label || m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-muted-foreground text-[11px] block mb-1">Value</label>
              <input
                type="number"
                step="0.1"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={METRIC_META[newMetric]?.unit || ''}
                className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground w-32"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-[11px] block mb-1">Date</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground"
              />
            </div>
            <button onClick={addManual} className="bg-primary text-foreground px-4 py-1.5 rounded text-sm font-medium">Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading wellness metrics...</p>
      ) : !hasData ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center space-y-4">
          <Heart size={36} className="mx-auto text-muted-foreground/40" />
          <div>
            <p className="text-foreground font-semibold">No wellness data yet</p>
            <p className="text-muted-foreground text-sm mt-1">Connect Garmin (coming soon), log manually, or seed demo data to explore the page.</p>
          </div>
          <div className="flex justify-center gap-2 pt-2">
            <button onClick={seedDemo} className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Sparkles size={14} /> Seed 30 days of demo data
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Today cards */}
          <div>
            <h3 className="text-foreground font-semibold mb-3">Latest</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {METRIC_ORDER.map((key) => {
                const meta = METRIC_META[key];
                const entry = summary?.today[key];
                const Icon = meta.icon;
                return (
                  <div key={key} className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={14} className={meta.color} />
                      <p className="text-muted-foreground text-xs">{meta.label}</p>
                    </div>
                    <p className="text-foreground text-xl font-bold">
                      {entry && entry.value !== null ? meta.formatter!(Number(entry.value)) : '—'}
                    </p>
                    {entry && <p className="text-muted-foreground/60 text-[10px] mt-0.5">{new Date(entry.date).toLocaleDateString()}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trends */}
          <div>
            <h3 className="text-foreground font-semibold mb-3">30-day trends</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {METRIC_ORDER.map((key) => {
                const meta = METRIC_META[key];
                const points = summary?.trends[key] ?? [];
                const Icon = meta.icon;
                const latest = points[points.length - 1]?.value;
                const earliest = points[0]?.value;
                const change = latest !== undefined && earliest !== undefined ? latest - earliest : 0;
                const changePct = earliest ? Math.round((change / earliest) * 100) : 0;
                return (
                  <div key={key} className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon size={14} className={meta.color} />
                        <p className="text-foreground text-sm font-medium">{meta.label}</p>
                      </div>
                      {points.length >= 2 && (
                        <span className={`text-[10px] font-medium ${changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {changePct >= 0 ? '+' : ''}{changePct}%
                        </span>
                      )}
                    </div>
                    <Sparkline points={points} color={meta.color.includes('blue') ? '#60a5fa' : meta.color.includes('indigo') ? '#818cf8' : meta.color.includes('red') ? '#f87171' : meta.color.includes('yellow') ? '#facc15' : meta.color.includes('orange') ? '#fb923c' : '#4ade80'} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Workouts */}
          {summary && summary.workouts.length > 0 && (
            <div>
              <h3 className="text-foreground font-semibold mb-3 flex items-center gap-2">
                <Dumbbell size={16} /> Recent workouts
              </h3>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead><tr className="border-b border-border">
                    {['Date', 'Activity', 'Duration', 'Distance', 'Calories'].map((h) => (
                      <th key={h} className="text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 text-left">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {summary.workouts.map((w, i) => (
                      <tr key={i} className="hover:bg-secondary/30">
                        <td className="px-5 py-3 text-muted-foreground text-sm">{new Date(w.date).toLocaleDateString()}</td>
                        <td className="px-5 py-3 text-foreground text-sm">{w.name || '—'}</td>
                        <td className="px-5 py-3 text-muted-foreground text-sm">{w.duration_min ? `${w.duration_min} min` : '—'}</td>
                        <td className="px-5 py-3 text-muted-foreground text-sm">{w.distance_km ? `${w.distance_km} km` : '—'}</td>
                        <td className="px-5 py-3 text-muted-foreground text-sm">{w.calories || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Connect panel */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-foreground font-semibold mb-3 flex items-center gap-2">
          <Activity size={16} /> Data sources
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between mb-2">
              <p className="text-foreground font-medium text-sm">Garmin Connect</p>
              <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Coming soon</span>
            </div>
            <p className="text-muted-foreground text-xs">Direct sync via Garmin Connect IQ. POST endpoint is live — wire a python-garminconnect script or phone shortcut to <code className="bg-secondary px-1 rounded">/api/wellness/ingest</code> to start importing today.</p>
          </div>
          <div className="p-4 rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between mb-2">
              <p className="text-foreground font-medium text-sm">Apple Health</p>
              <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Coming soon</span>
            </div>
            <p className="text-muted-foreground text-xs">iOS Shortcut → webhook. Same ingestion endpoint, source: <code className="bg-secondary px-1 rounded">apple_health</code>.</p>
          </div>
          <div className="p-4 rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between mb-2">
              <p className="text-foreground font-medium text-sm">Manual entry</p>
              <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">Active</span>
            </div>
            <p className="text-muted-foreground text-xs">Use the &quot;Log manual&quot; button above to enter any metric by hand.</p>
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}
