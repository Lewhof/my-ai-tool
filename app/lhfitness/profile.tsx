'use client';

import { useState } from 'react';
import { useRef } from 'react';
import { User, Target, Wrench, Calendar, Download, Upload, RotateCcw, Activity, FileUp, Image as ImageIcon, Loader2, Trash2, AlertCircle, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FitnessState, Profile, Equipment, Goal, ImportedWorkout } from './types';
import { exportData, importData, resetAll, setProfile, appendImports, isDuplicate, deleteImport, autoLinkImports, buildTrainingSummary } from './store';

interface Props {
  state: FitnessState;
  dispatch: (m: (s: FitnessState) => FitnessState) => void;
}

const ALL_EQUIPMENT: Array<{ id: Equipment; label: string }> = [
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'barbell', label: 'Barbell' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'pullup_bar', label: 'Pull-up bar' },
  { id: 'bench', label: 'Bench' },
  { id: 'bands', label: 'Bands' },
  { id: 'cable', label: 'Cable' },
  { id: 'machine', label: 'Machines' },
  { id: 'rower', label: 'Rower' },
  { id: 'bike', label: 'Bike' },
];

export default function ProfileView({ state, dispatch }: Props) {
  const profile = state.profile;
  if (!profile) return null;

  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState<Profile>(profile);

  const save = () => {
    setProfile(edited, dispatch);
    toast.success('Profile updated');
    setEditing(false);
  };

  const handleExport = () => {
    const json = exportData(state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lhfitness-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const ok = importData(reader.result as string, dispatch);
        if (ok) toast.success('Imported');
        else toast.error('Invalid file');
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleReset = () => {
    if (!confirm('Reset everything? This deletes your profile, all workouts, sessions, PRs, and chat history. Cannot be undone.')) return;
    resetAll(dispatch);
    toast.success('Reset complete');
  };

  return (
    <div className="space-y-6 pb-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Your training settings and data.</p>
      </div>

      {/* Profile card */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
            <User className="text-primary" size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-foreground font-bold text-xl">{profile.name}</h2>
            <p className="text-muted-foreground text-sm capitalize">{profile.goals.length === 1 ? profile.goals[0].replace('_', ' ') : `Hybrid · ${profile.goals.length} goals`} · {profile.difficulty}</p>
          </div>
          <button
            onClick={() => { setEdited(profile); setEditing(!editing); }}
            className="text-muted-foreground hover:text-foreground text-sm font-medium"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {!editing ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Field label="Weekly target" value={`${profile.weekly_target} sessions`} />
            <Field label="Body weight" value={profile.weight_kg ? `${profile.weight_kg} kg` : 'Not set'} />
            <Field label="Equipment" value={`${profile.available_equipment.length} items`} />
            <Field label="Member since" value={new Date(profile.created_at).toLocaleDateString()} />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Name</label>
              <input
                value={edited.name}
                onChange={(e) => setEdited({ ...edited, name: e.target.value })}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-primary/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Goals (pick one or more)</label>
              <div className="flex flex-wrap gap-1.5">
                {(['strength', 'hypertrophy', 'fat_loss', 'endurance', 'athletic', 'mobility'] as Goal[]).map(g => {
                  const has = edited.goals.includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => {
                        const next = has
                          ? edited.goals.filter(x => x !== g)
                          : [...edited.goals, g];
                        setEdited({ ...edited, goals: next });
                      }}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium border capitalize',
                        has ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {g.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Level</label>
              <select
                value={edited.difficulty}
                onChange={(e) => setEdited({ ...edited, difficulty: e.target.value as Profile['difficulty'] })}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-primary/60 focus:outline-none"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Body weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={edited.weight_kg ?? ''}
                  onChange={(e) => setEdited({ ...edited, weight_kg: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-primary/60 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Sessions / week</label>
                <input
                  type="number"
                  min={1} max={7}
                  value={edited.weekly_target}
                  onChange={(e) => setEdited({ ...edited, weekly_target: Number(e.target.value) || 4 })}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-primary/60 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-foreground text-xs uppercase tracking-wide font-semibold block mb-2">Equipment</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_EQUIPMENT.map(e => {
                  const has = edited.available_equipment.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => {
                        const next = has
                          ? edited.available_equipment.filter(x => x !== e.id)
                          : [...edited.available_equipment, e.id];
                        setEdited({ ...edited, available_equipment: next });
                      }}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium border',
                        has ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {e.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary">Cancel</button>
              <button onClick={save} className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground btn-brand">Save changes</button>
            </div>
          </div>
        )}
      </section>

      {/* Stats summary */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-foreground font-bold mb-4 flex items-center gap-2">
          <Activity size={16} className="text-primary" /> All-time stats
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Field label="Workouts" value={String(state.workouts.length)} />
          <Field label="Sessions" value={String(state.sessions.length)} />
          <Field label="PRs" value={String(state.prs.length)} />
          <Field label="Body entries" value={String(state.body_metrics.length)} />
        </div>
      </section>

      {/* What the AI knows — derived from sessions + imports + profile */}
      <KnowledgeCard state={state} />

      {/* Import workouts */}
      <ImportSection state={state} dispatch={dispatch} />

      {/* Data management */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-foreground font-bold mb-1">Data</h3>
        <p className="text-muted-foreground text-sm mb-4">Your data lives in this browser. Export to back up; import to restore.</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary"
          >
            <Download size={14} /> Export JSON
          </button>
          <button
            onClick={handleImport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary"
          >
            <Upload size={14} /> Import
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10"
          >
            <RotateCcw size={14} /> Reset everything
          </button>
        </div>
      </section>

      <p className="text-muted-foreground text-xs text-center pt-4">
        LH Fitness · Part of the Lewhofmeyr platform · v1.0
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
      <p className="text-foreground text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}

// ── Knowledge card ────────────────────────────────────────────────────
// Shows the user exactly what the AI sees when personalising recommendations,
// so they can verify imports were processed correctly and understand "why" the
// coach recommends what it does.

function KnowledgeCard({ state }: { state: FitnessState }) {
  const summary = buildTrainingSummary(state);
  const types = Object.entries(summary.last_30d_by_type).sort((a, b) => b[1] - a[1]);
  const topImports = state.imported_workouts.slice(0, 5);

  return (
    <section className="bg-card border border-border rounded-2xl p-6">
      <h3 className="text-foreground font-bold mb-1 flex items-center gap-2">
        <Sparkles size={16} className="text-primary" /> What the AI knows about you
      </h3>
      <p className="text-muted-foreground text-sm mb-4">
        This is the digest your coach sees. Imports + sessions + PRs together — it's how recommendations stay anchored to reality.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KStat label="Active days (30d)" value={`${summary.last_30d_active_days}/30`} />
        <KStat label="This week" value={`${summary.last_7d_total}/${summary.weekly_target}`} sub={`${summary.weekly_target_pct}% of target`} />
        <KStat label="Streak" value={`${summary.current_streak_days}d`} />
        <KStat label="Longest gap (30d)" value={`${summary.longest_recent_gap_days}d`} />
      </div>

      {(summary.last_30d_running_km > 0 || summary.last_30d_strength_volume_kg > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {summary.last_30d_running_km > 0 && (
            <KStat
              label="Running mileage (30d)"
              value={`${summary.last_30d_running_km}km`}
              sub={summary.median_running_distance_km ? `median run ${summary.median_running_distance_km}km` : undefined}
            />
          )}
          {summary.last_30d_strength_volume_kg > 0 && (
            <KStat
              label="Strength volume (30d)"
              value={`${summary.last_30d_strength_volume_kg.toLocaleString()}kg`}
              sub={`across ${state.sessions.filter(s => Date.now() - new Date(s.started_at).getTime() < 30*86400000).length} sessions`}
            />
          )}
        </div>
      )}

      {types.length > 0 && (
        <div className="mb-4">
          <p className="text-foreground text-xs uppercase tracking-wide font-bold mb-2">Activity mix (30d)</p>
          <div className="flex flex-wrap gap-1.5">
            {types.map(([type, count]) => (
              <div key={type} className="bg-secondary border border-border rounded-full px-2.5 py-1 text-xs flex items-center gap-1.5">
                <span className="text-foreground font-medium">{type}</span>
                <span className="text-muted-foreground tabular-nums">×{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topImports.length > 0 && (
        <div>
          <p className="text-foreground text-xs uppercase tracking-wide font-bold mb-2">
            Imported activities recognised ({state.imported_workouts.length} total)
          </p>
          <div className="space-y-1">
            {topImports.map(i => (
              <div key={i.id} className="text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1.5 flex items-center gap-2">
                <span className="text-foreground font-medium">{i.name || i.type}</span>
                <span className="opacity-60">·</span>
                <span>{new Date(i.date).toLocaleDateString()}</span>
                {i.duration_seconds && <><span className="opacity-60">·</span><span>{Math.round(i.duration_seconds / 60)}m</span></>}
                {i.distance_km && <><span className="opacity-60">·</span><span>{i.distance_km.toFixed(2)}km</span></>}
                {i.avg_hr && <><span className="opacity-60">·</span><span>{i.avg_hr}bpm</span></>}
              </div>
            ))}
            {state.imported_workouts.length > 5 && (
              <p className="text-[10px] text-muted-foreground/60 italic mt-1">+ {state.imported_workouts.length - 5} more · all visible on the Plan calendar</p>
            )}
          </div>
        </div>
      )}

      {summary.last_30d_total === 0 && (
        <p className="text-muted-foreground text-sm italic">No activity in the last 30 days. Log a session, run a workout, or import from Garmin to give the AI something to work with.</p>
      )}
    </section>
  );
}

function KStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-secondary/50 border border-border rounded-lg px-3 py-2">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
      <p className="text-foreground text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-muted-foreground text-[10px] truncate">{sub}</p>}
    </div>
  );
}

// ── Import section ────────────────────────────────────────────────────

import { useState as useStateReact } from 'react';

type DupeRow = { incoming: ImportedWorkout; existing: ImportedWorkout };

function ImportSection({
  state, dispatch,
}: {
  state: FitnessState; dispatch: (m: (s: FitnessState) => FitnessState) => void;
}) {
  const [busy, setBusy] = useStateReact(false);
  const [pending, setPending] = useStateReact<ImportedWorkout[]>([]);
  const [dupes, setDupes] = useStateReact<DupeRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setBusy(true);
    try {
      const isImage = /^image\//.test(file.type);
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      const isTcx = /\.tcx$/i.test(file.name) || file.type === 'application/vnd.garmin.tcx+xml';

      if (!isImage && !isCsv && !isTcx) {
        toast.error('Unsupported file. Use .csv, .tcx, or an image (PNG/JPG)');
        setBusy(false);
        return;
      }

      const endpoint = isImage
        ? '/api/lhfitness/import/screenshot'
        : isCsv
          ? '/api/lhfitness/import/garmin-csv'
          : '/api/lhfitness/import/garmin-tcx';

      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Import failed (${res.status})`);
      }
      const data = await res.json();
      const workouts: ImportedWorkout[] = data.workouts || [];
      if (workouts.length === 0) {
        toast.error('Nothing extracted from that file');
        setBusy(false);
        return;
      }

      // Granular dedupe: separate clean vs potential duplicates
      const clean: ImportedWorkout[] = [];
      const dupeRows: DupeRow[] = [];
      for (const w of workouts) {
        const existing = isDuplicate(w, [...state.imported_workouts, ...clean]);
        if (existing) dupeRows.push({ incoming: w, existing });
        else clean.push(w);
      }

      setPending(clean);
      setDupes(dupeRows);

      const lowConfNote = data.low_confidence_count ? ` · ${data.low_confidence_count} low confidence` : '';
      toast.success(`Parsed ${workouts.length} activit${workouts.length === 1 ? 'y' : 'ies'}${lowConfNote}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const commitAll = (includeOverlaps: boolean) => {
    const toAdd = includeOverlaps
      ? [...pending, ...dupes.map(d => d.incoming)]
      : [...pending];
    if (toAdd.length === 0) {
      toast.error('Nothing to import');
      return;
    }
    appendImports(toAdd, dispatch);
    // Auto-link imports to scheduled sessions on the same date when types match
    const { linked } = autoLinkImports(toAdd, dispatch);
    const linkedNote = linked > 0 ? ` · ${linked} planned session${linked === 1 ? '' : 's'} marked complete` : '';
    toast.success(`Imported ${toAdd.length} activit${toAdd.length === 1 ? 'y' : 'ies'}${linkedNote}`);
    setPending([]);
    setDupes([]);
  };

  const triggerFile = () => fileRef.current?.click();
  const triggerShot = () => shotRef.current?.click();

  return (
    <section className="bg-card border border-border rounded-2xl p-6">
      <h3 className="text-foreground font-bold mb-1 flex items-center gap-2">
        <Activity size={16} className="text-primary" /> Import workouts
      </h3>
      <p className="text-muted-foreground text-sm mb-4">
        Bring in your Garmin (or any tracker) history. Dedupe is granular — exact start time + duration match within 60 seconds.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <button
          onClick={triggerFile}
          disabled={busy}
          className="flex items-start gap-3 p-4 rounded-xl border border-border hover:border-primary/40 bg-secondary text-left transition-colors disabled:opacity-50"
        >
          <FileUp size={18} className="text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-foreground font-bold text-sm">CSV or TCX file</p>
            <p className="text-muted-foreground text-xs mt-0.5">Garmin Connect export. CSV for bulk history; TCX for one detailed activity.</p>
          </div>
        </button>
        <button
          onClick={triggerShot}
          disabled={busy}
          className="flex items-start gap-3 p-4 rounded-xl border border-border hover:border-primary/40 bg-secondary text-left transition-colors disabled:opacity-50"
        >
          <ImageIcon size={18} className="text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-foreground font-bold text-sm">Screenshot</p>
            <p className="text-muted-foreground text-xs mt-0.5">Photo of any tracker app screen. AI vision reads it.</p>
          </div>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tcx,application/vnd.garmin.tcx+xml,text/csv"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={shotRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      {busy && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm bg-secondary border border-border rounded-xl px-4 py-3 mb-3">
          <Loader2 size={14} className="animate-spin" />
          Parsing...
        </div>
      )}

      {/* Review pane */}
      {(pending.length > 0 || dupes.length > 0) && (
        <ReviewPane
          pending={pending}
          dupes={dupes}
          onDiscard={() => { setPending([]); setDupes([]); }}
          onCommit={commitAll}
        />
      )}

      {/* Existing imports */}
      {state.imported_workouts.length > 0 && (
        <div className="mt-4">
          <p className="text-muted-foreground text-[10px] uppercase tracking-wide font-bold mb-2">
            Recent imports ({state.imported_workouts.length})
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {state.imported_workouts.slice(0, 10).map(i => (
              <div key={i.id} className="bg-secondary rounded-lg px-3 py-2 flex items-center gap-2 text-xs group">
                <Activity size={11} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground truncate">{i.name || i.type} · {new Date(i.date).toLocaleDateString()}</p>
                  <p className="text-muted-foreground text-[10px]">
                    {i.duration_seconds && `${Math.round(i.duration_seconds / 60)}m`}
                    {i.distance_km && ` · ${i.distance_km.toFixed(2)}km`}
                    <span className="ml-1 opacity-60">· {i.source.replace('garmin_', 'g.')}</span>
                  </p>
                </div>
                <button
                  onClick={() => deleteImport(i.id, dispatch)}
                  className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewPane({
  pending, dupes, onDiscard, onCommit,
}: {
  pending: ImportedWorkout[];
  dupes: DupeRow[];
  onDiscard: () => void;
  onCommit: (includeOverlaps: boolean) => void;
}) {
  return (
    <div className="bg-background border border-primary/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-foreground font-bold text-sm flex items-center gap-2">
          <Check size={14} className="text-emerald-400" />
          Review & confirm
        </p>
        <button onClick={onDiscard} className="text-muted-foreground hover:text-foreground text-xs">
          Discard all
        </button>
      </div>

      {pending.length > 0 && (
        <div>
          <p className="text-emerald-400 text-[11px] uppercase tracking-wide font-bold mb-1.5">
            New ({pending.length})
          </p>
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {pending.map(p => (
              <div key={p.id} className="text-xs text-foreground bg-emerald-500/5 border border-emerald-500/20 rounded px-2 py-1.5">
                <span className="font-medium">{p.name || p.type}</span>
                <span className="text-muted-foreground"> · {new Date(p.date).toLocaleDateString()}</span>
                {p.duration_seconds && <span className="text-muted-foreground"> · {Math.round(p.duration_seconds / 60)}m</span>}
                {p.distance_km && <span className="text-muted-foreground"> · {p.distance_km.toFixed(2)}km</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {dupes.length > 0 && (
        <div>
          <p className="text-yellow-400 text-[11px] uppercase tracking-wide font-bold mb-1.5 flex items-center gap-1">
            <AlertCircle size={11} /> Possible duplicates ({dupes.length})
          </p>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {dupes.map((d, i) => (
              <div key={i} className="text-xs bg-yellow-500/5 border border-yellow-500/20 rounded px-2 py-1.5">
                <p className="text-foreground font-medium">{d.incoming.name || d.incoming.type}</p>
                <p className="text-muted-foreground text-[10px]">
                  matches existing: {d.existing.name || d.existing.type} · {new Date(d.existing.date).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onCommit(false)}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-primary text-primary-foreground btn-brand"
        >
          Import {pending.length} new
        </button>
        {dupes.length > 0 && (
          <button
            onClick={() => onCommit(true)}
            className="px-3 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground"
          >
            Include duplicates
          </button>
        )}
      </div>
    </div>
  );
}
