'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Brain, ArrowLeft, Plus, Trash2, Check, X, Wand2,
  BarChart3, MessageSquareWarning, Sparkles, Loader2, ChevronRight,
} from 'lucide-react';

type Rule = {
  id: string;
  rule: string;
  category: 'do' | 'dont' | 'prefer';
  source: 'manual' | 'reflection' | 'feedback' | 'self';
  active: boolean;
  hits: number;
  created_at: string;
  updated_at: string;
};

type ToolMetric = {
  tool_name: string;
  calls: number;
  success_rate: number;
  p50_ms: number;
  p95_ms: number;
  last_error: string | null;
};

type MetricsResponse = {
  window_days: number;
  total_calls: number;
  overall_success_rate: number;
  tools: ToolMetric[];
};

type FeedbackEntry = {
  id: string;
  message_id: string;
  rating: 'up' | 'down';
  correction_text: string | null;
  resolved: boolean;
  created_at: string;
  message_content: string;
};

type CandidateRule = {
  rule: string;
  category: 'do' | 'dont' | 'prefer';
  reasoning: string;
};

type Tab = 'rules' | 'metrics' | 'corrections' | 'reflect';

const CATEGORY_STYLES: Record<Rule['category'], { label: string; color: string; bg: string }> = {
  do:     { label: 'DO',     color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  dont:   { label: "DON'T",  color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30' },
  prefer: { label: 'PREFER', color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30' },
};

const SOURCE_LABELS: Record<Rule['source'], string> = {
  manual:     'you',
  reflection: 'reflection',
  feedback:   'feedback',
  self:       'Cerebro',
};

export default function BrainPage() {
  const [tab, setTab] = useState<Tab>('rules');

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Link href="/cerebro" className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 mb-2">
            <ArrowLeft size={12} /> Back to Cerebro
          </Link>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain size={22} className="text-primary" /> Cerebro Brain
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Learned rules, tool telemetry, corrections, and reflection — curate how Cerebro evolves.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: 'rules',       label: 'Rules',       icon: Brain },
          { id: 'metrics',     label: 'Tool Metrics', icon: BarChart3 },
          { id: 'corrections', label: 'Corrections', icon: MessageSquareWarning },
          { id: 'reflect',     label: 'Reflect',     icon: Sparkles },
        ] as const).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'rules' && <RulesTab />}
      {tab === 'metrics' && <MetricsTab />}
      {tab === 'corrections' && <CorrectionsTab />}
      {tab === 'reflect' && <ReflectTab />}
    </div>
  );
}

// ── RULES TAB ──
function RulesTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [newCategory, setNewCategory] = useState<Rule['category']>('prefer');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cerebro/rules');
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch {
      toast.error('Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addRule = async () => {
    if (!newRule.trim()) return;
    const res = await fetch('/api/cerebro/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: newRule.trim(), category: newCategory, source: 'manual' }),
    });
    if (res.ok) {
      toast.success('Rule saved');
      setNewRule('');
      setShowAdd(false);
      load();
    } else {
      toast.error('Failed to save rule');
    }
  };

  const toggleActive = async (r: Rule) => {
    const res = await fetch('/api/cerebro/rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    });
    if (res.ok) {
      toast.success(r.active ? 'Rule paused' : 'Rule activated');
      load();
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this rule? This cannot be undone.')) return;
    const res = await fetch(`/api/cerebro/rules?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Rule deleted');
      load();
    }
  };

  const active = rules.filter((r) => r.active);
  const paused = rules.filter((r) => !r.active);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-foreground text-sm font-semibold">
            {active.length} active · {paused.length} paused
          </p>
          <p className="text-muted-foreground text-[11px]">
            Active rules are injected into Cerebro&apos;s system prompt on every turn.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bg-primary text-foreground px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <Plus size={12} /> Add rule
        </button>
      </div>

      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <textarea
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="e.g. Always confirm before deleting tasks"
            rows={2}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-none"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(['do', 'dont', 'prefer'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setNewCategory(c)}
                  className={`px-3 py-1 text-[11px] font-semibold rounded border transition-colors ${
                    newCategory === c ? CATEGORY_STYLES[c].bg + ' ' + CATEGORY_STYLES[c].color : 'border-border text-muted-foreground'
                  }`}
                >
                  {CATEGORY_STYLES[c].label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground px-3 py-1 text-xs">Cancel</button>
              <button onClick={addRule} className="bg-primary text-foreground px-4 py-1 rounded text-xs font-medium">Save</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading rules...</p>
      ) : rules.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-10 text-center">
          <Brain size={32} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-foreground font-semibold">No rules yet</p>
          <p className="text-muted-foreground text-sm mt-1">
            Add one manually, tell Cerebro &ldquo;remember that I prefer X&rdquo;, or run reflection on past conversations.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => {
            const style = CATEGORY_STYLES[r.category];
            return (
              <div
                key={r.id}
                className={`bg-card border rounded-lg p-3 flex items-start gap-3 transition-opacity ${
                  r.active ? 'border-border' : 'border-border opacity-50'
                }`}
              >
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${style.bg} ${style.color} shrink-0 mt-0.5`}>
                  {style.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm">{r.rule}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>added by {SOURCE_LABELS[r.source]}</span>
                    <span>·</span>
                    <span>{r.hits} hits</span>
                    <span>·</span>
                    <span>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(r)}
                    className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-secondary"
                    title={r.active ? 'Pause' : 'Activate'}
                  >
                    {r.active ? <X size={13} /> : <Check size={13} />}
                  </button>
                  <button
                    onClick={() => deleteRule(r.id)}
                    className="text-muted-foreground hover:text-red-400 p-1.5 rounded hover:bg-secondary"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── METRICS TAB ──
function MetricsTab() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cerebro/metrics?days=${days}`);
      const data = await res.json();
      setMetrics(data);
    } catch {
      toast.error('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-muted-foreground text-sm">Loading metrics...</p>;
  if (!metrics) return <p className="text-muted-foreground text-sm">No data.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-foreground text-sm font-semibold">Tool telemetry</p>
          <p className="text-muted-foreground text-[11px]">
            Raw call records kept for 90 days. Aggregates below cover the selected window.
          </p>
        </div>
        <div className="flex gap-1">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-[11px] font-semibold rounded border transition-colors ${
                days === d ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-[11px]">Total calls</p>
          <p className="text-foreground text-2xl font-bold mt-1">{metrics.total_calls.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-[11px]">Success rate</p>
          <p className="text-foreground text-2xl font-bold mt-1">
            {(metrics.overall_success_rate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-[11px]">Distinct tools</p>
          <p className="text-foreground text-2xl font-bold mt-1">{metrics.tools.length}</p>
        </div>
      </div>

      {/* Tool table */}
      {metrics.tools.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-10 text-center">
          <BarChart3 size={32} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-foreground font-semibold">No tool calls yet in this window</p>
          <p className="text-muted-foreground text-sm mt-1">Ask Cerebro to do something and come back.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/40">
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-2">Tool</th>
                <th className="px-4 py-2 text-right">Calls</th>
                <th className="px-4 py-2 text-right">Success</th>
                <th className="px-4 py-2 text-right">p50</th>
                <th className="px-4 py-2 text-right">p95</th>
              </tr>
            </thead>
            <tbody>
              {metrics.tools.map((t) => {
                const successColor =
                  t.success_rate >= 0.95 ? 'text-emerald-400' :
                  t.success_rate >= 0.8  ? 'text-yellow-400' : 'text-red-400';
                return (
                  <tr key={t.tool_name} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="text-foreground font-mono text-[12px]">{t.tool_name}</p>
                      {t.last_error && (
                        <p className="text-red-400/70 text-[10px] truncate max-w-sm mt-0.5">{t.last_error}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-foreground tabular-nums">{t.calls}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${successColor}`}>
                      {(t.success_rate * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{t.p50_ms}ms</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{t.p95_ms}ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── CORRECTIONS TAB ──
function CorrectionsTab() {
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [distilling, setDistilling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = showResolved ? '/api/cerebro/feedback' : '/api/cerebro/feedback?resolved=false';
      const res = await fetch(url);
      const data = await res.json();
      setItems(data.feedback ?? []);
    } catch {
      toast.error('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => { load(); }, [load]);

  const markResolved = async (id: string) => {
    const res = await fetch('/api/cerebro/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolved: true }),
    });
    if (res.ok) {
      toast.success('Marked resolved');
      load();
    }
  };

  const distill = async (item: FeedbackEntry) => {
    setDistilling(item.id);
    // Simple inline distillation: create a rule directly from the correction text.
    const ruleText = item.correction_text?.trim() || 'Avoid the behavior shown in the previous response';
    const category = 'dont';
    const res = await fetch('/api/cerebro/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: ruleText.slice(0, 200), category, source: 'feedback' }),
    });
    if (res.ok) {
      await markResolved(item.id);
      toast.success('Rule created from correction');
    } else {
      toast.error('Failed to distill rule');
    }
    setDistilling(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-foreground text-sm font-semibold">Corrections & feedback</p>
          <p className="text-muted-foreground text-[11px]">
            Every thumbs-down you give. Distill the ones worth remembering into rules.
          </p>
        </div>
        <button
          onClick={() => setShowResolved((v) => !v)}
          className="text-muted-foreground hover:text-foreground text-[11px] px-3 py-1 border border-border rounded"
        >
          {showResolved ? 'Hide resolved' : 'Show all'}
        </button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-10 text-center">
          <MessageSquareWarning size={32} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-foreground font-semibold">No corrections yet</p>
          <p className="text-muted-foreground text-sm mt-1">
            Hover any Cerebro reply and press 👎 to capture feedback.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <div
              key={f.id}
              className={`bg-card border rounded-lg p-4 space-y-3 ${
                f.resolved ? 'border-border opacity-50' : f.rating === 'down' ? 'border-red-500/30' : 'border-emerald-500/30'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                    f.rating === 'down' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}>
                    {f.rating === 'down' ? '👎 DOWN' : '👍 UP'}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {new Date(f.created_at).toLocaleString()}
                  </span>
                  {f.resolved && <span className="text-muted-foreground text-[10px]">· resolved</span>}
                </div>
                {!f.resolved && f.rating === 'down' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => distill(f)}
                      disabled={distilling === f.id}
                      className="bg-primary/90 hover:bg-primary text-foreground text-[11px] px-3 py-1 rounded font-medium flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {distilling === f.id ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                      Distill rule
                    </button>
                    <button
                      onClick={() => markResolved(f.id)}
                      className="text-muted-foreground hover:text-foreground text-[11px] px-3 py-1 border border-border rounded"
                    >
                      Mark resolved
                    </button>
                  </div>
                )}
              </div>
              <p className="text-muted-foreground text-xs italic border-l-2 border-border pl-3">
                &ldquo;{f.message_content}&rdquo;
              </p>
              {f.correction_text && (
                <p className="text-foreground text-sm">
                  <span className="text-muted-foreground text-[11px] font-semibold">Your note: </span>
                  {f.correction_text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── REFLECT TAB ──
function ReflectTab() {
  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState<CandidateRule[]>([]);
  const [reviewed, setReviewed] = useState<{ turns: number; corrections: number } | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [dismissedIdx, setDismissedIdx] = useState<Set<number>>(new Set());

  const runReflection = async () => {
    setRunning(true);
    setCandidates([]);
    setDismissedIdx(new Set());
    try {
      const res = await fetch('/api/cerebro/reflect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reflection failed');
      setCandidates(data.candidates ?? []);
      setReviewed(data.reviewed ?? null);
      if (data.message) toast(data.message);
      else if ((data.candidates ?? []).length === 0) toast('No new rules to propose');
      else toast.success(`${data.candidates.length} candidate rule${data.candidates.length !== 1 ? 's' : ''} ready`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setRunning(false);
    }
  };

  const acceptCandidate = async (idx: number) => {
    const c = candidates[idx];
    setSavingIdx(idx);
    const res = await fetch('/api/cerebro/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: c.rule, category: c.category, source: 'reflection' }),
    });
    if (res.ok) {
      toast.success('Rule accepted');
      setDismissedIdx((prev) => new Set(prev).add(idx));
    } else {
      toast.error('Failed to save rule');
    }
    setSavingIdx(null);
  };

  const dismissCandidate = (idx: number) => {
    setDismissedIdx((prev) => new Set(prev).add(idx));
  };

  const remaining = candidates.filter((_, i) => !dismissedIdx.has(i));

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <Sparkles size={14} className="text-primary" /> Manual reflection
            </h3>
            <p className="text-muted-foreground text-[11px] mt-1 max-w-lg">
              Read the last 50 Cerebro turns + any unresolved corrections and propose 1-5 new behavior rules.
              Reflection runs on Sonnet (~$0.04 per run) and never auto-applies anything — you approve each candidate.
            </p>
          </div>
          <button
            onClick={runReflection}
            disabled={running}
            className="bg-primary text-foreground px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {running ? 'Reflecting...' : 'Run reflection now'}
          </button>
        </div>
        {reviewed && (
          <p className="text-muted-foreground text-[11px] mt-4">
            Reviewed {reviewed.turns} turns and {reviewed.corrections} corrections.
          </p>
        )}
      </div>

      {remaining.length > 0 && (
        <div className="space-y-3">
          <p className="text-foreground text-sm font-semibold">Candidate rules</p>
          {candidates.map((c, idx) => {
            if (dismissedIdx.has(idx)) return null;
            const style = CATEGORY_STYLES[c.category];
            return (
              <div key={idx} className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${style.bg} ${style.color} shrink-0 mt-0.5`}>
                    {style.label}
                  </span>
                  <p className="text-foreground text-sm flex-1">{c.rule}</p>
                </div>
                <p className="text-muted-foreground text-[11px] italic flex items-start gap-1">
                  <ChevronRight size={11} className="shrink-0 mt-0.5" />
                  {c.reasoning}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptCandidate(idx)}
                    disabled={savingIdx === idx}
                    className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-[11px] px-3 py-1 rounded font-medium flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingIdx === idx ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Accept
                  </button>
                  <button
                    onClick={() => dismissCandidate(idx)}
                    className="text-muted-foreground hover:text-foreground text-[11px] px-3 py-1 border border-border rounded flex items-center gap-1.5"
                  >
                    <X size={11} /> Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
