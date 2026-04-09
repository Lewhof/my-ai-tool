'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Target, Plus, Trash2, Pencil, Loader2,
  CheckCircle2, AlertTriangle, Archive,
  Sparkles, X, ChevronRight, Calendar as CalendarIcon,
  TrendingUp,
} from 'lucide-react';

interface KeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  status: 'on-track' | 'at-risk' | 'completed';
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: 'active' | 'completed' | 'archived';
  key_results: KeyResult[];
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Target }> = {
  active: { label: 'Active', color: 'text-primary', bg: 'bg-primary/10 border-primary/30', icon: Target },
  completed: { label: 'Completed', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', icon: CheckCircle2 },
  archived: { label: 'Archived', color: 'text-muted-foreground', bg: 'bg-muted/10 border-border', icon: Archive },
};

function endOfQuarter(d: Date) {
  const m = d.getMonth();
  const q = Math.floor(m / 3);
  const endMonth = q * 3 + 2;
  const end = new Date(d.getFullYear(), endMonth + 1, 0); // last day of quarter month
  return end.toISOString().split('T')[0];
}

function daysBetween(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function calculateProgress(goal: Goal): number {
  const krs = goal.key_results || [];
  if (krs.length === 0) return 0;
  const total = krs.reduce((sum, kr) => {
    if (kr.target <= 0) return sum;
    return sum + Math.min(kr.current / kr.target, 1);
  }, 0);
  return Math.round((total / krs.length) * 100);
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [filter, setFilter] = useState<'active' | 'completed' | 'archived' | 'all'>('active');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTargetDate, setFormTargetDate] = useState('');
  const [formKRs, setFormKRs] = useState<KeyResult[]>([]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormTitle('');
    setFormDescription('');
    setFormTargetDate('');
    setFormKRs([]);
  };

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/goals');
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const fetchInsight = useCallback(async () => {
    setInsightLoading(true);
    try {
      const res = await fetch('/api/goals/insight');
      const data = await res.json();
      setInsight(data.insight || '');
    } catch { /* silent */ }
    setInsightLoading(false);
  }, []);

  useEffect(() => {
    fetchGoals();
    fetchInsight();
  }, [fetchGoals, fetchInsight]);

  const startEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setFormTitle(goal.title);
    setFormDescription(goal.description || '');
    setFormTargetDate(goal.target_date || '');
    setFormKRs((goal.key_results || []).map(kr => ({ ...kr })));
    setShowForm(true);
  };

  const addKR = () => {
    setFormKRs(prev => [
      ...prev,
      { id: `kr-${Date.now()}-${prev.length}`, title: '', target: 1, current: 0, unit: '', status: 'on-track' },
    ]);
  };

  const updateKR = (idx: number, field: keyof KeyResult, value: string | number) => {
    setFormKRs(prev => prev.map((kr, i) => (i === idx ? { ...kr, [field]: value } : kr)));
  };

  const removeKR = (idx: number) => {
    setFormKRs(prev => prev.filter((_, i) => i !== idx));
  };

  const saveGoal = async () => {
    if (!formTitle.trim()) {
      toast.error('Title required');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        title: formTitle,
        description: formDescription,
        target_date: formTargetDate || null,
        key_results: formKRs.filter(kr => kr.title.trim()),
      };
      const res = await fetch('/api/goals', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(editingId ? 'Objective updated' : 'Objective created');
        resetForm();
        fetchGoals();
        fetchInsight();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save objective');
    }
    setSaving(false);
  };

  const deleteGoal = async (id: string) => {
    if (!confirm('Delete this objective?')) return;
    try {
      const res = await fetch(`/api/goals?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setGoals(prev => prev.filter(g => g.id !== id));
        toast.success('Deleted');
        fetchInsight();
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  const setStatus = async (id: string, status: Goal['status']) => {
    try {
      const res = await fetch('/api/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        toast.success(`Marked as ${status}`);
        fetchGoals();
        fetchInsight();
      }
    } catch {
      toast.error('Failed to update status');
    }
  };

  const updateKRProgress = async (goal: Goal, krIdx: number, newCurrent: number) => {
    const updated = goal.key_results.map((kr, i) =>
      i === krIdx ? { ...kr, current: Math.max(0, newCurrent) } : kr
    );
    try {
      await fetch('/api/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: goal.id, key_results: updated }),
      });
      setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, key_results: updated } : g)));
      fetchInsight();
    } catch { /* silent */ }
  };

  // Filters
  const filtered = filter === 'all' ? goals : goals.filter(g => g.status === filter);
  const active = goals.filter(g => g.status === 'active');
  const totalKRs = active.reduce((sum, g) => sum + (g.key_results?.length || 0), 0);
  const completedKRs = active.reduce((sum, g) => {
    return sum + (g.key_results || []).filter(kr => kr.target > 0 && kr.current >= kr.target).length;
  }, 0);
  const avgProgress = active.length > 0
    ? Math.round(active.reduce((sum, g) => sum + calculateProgress(g), 0) / active.length)
    : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Goals & OKRs</h2>
          <p className="text-muted-foreground text-xs mt-0.5">Quarterly objectives and key results</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border">
            {(['active', 'completed', 'archived', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors capitalize',
                  filter === f
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => { resetForm(); setFormTargetDate(endOfQuarter(new Date())); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={12} />
            Add Objective
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={24} className="animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Loading objectives...</p>
          </div>
        ) : (
          <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {/* AI Insight Banner */}
            <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {insightLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground text-xs">Analyzing progress...</p>
                  </div>
                ) : (
                  <p className="text-foreground text-sm leading-relaxed">{insight || 'Your goals insight will appear here.'}</p>
                )}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Target size={14} className="text-primary" />
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Active Objectives</p>
                </div>
                <p className="text-foreground text-xl font-bold">{active.length}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={14} className="text-green-400" />
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">KRs Completed</p>
                </div>
                <p className="text-foreground text-xl font-bold">{completedKRs}<span className="text-muted-foreground text-sm">/{totalKRs}</span></p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={14} className="text-blue-400" />
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Avg Progress</p>
                </div>
                <p className="text-foreground text-xl font-bold">{avgProgress}%</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarIcon size={14} className="text-orange-400" />
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Quarter Ends</p>
                </div>
                <p className="text-foreground text-xl font-bold">
                  {(() => {
                    const d = daysBetween(endOfQuarter(new Date()));
                    return d !== null ? `${d}d` : '—';
                  })()}
                </p>
              </div>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-foreground font-semibold text-sm">
                    {editingId ? 'Edit Objective' : 'New Objective'}
                  </h3>
                  <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Title</label>
                    <input
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Ship 3 major features this quarter"
                      className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Description</label>
                    <textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Why does this matter?"
                      rows={2}
                      className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Target Date</label>
                    <input
                      type="date"
                      value={formTargetDate}
                      onChange={(e) => setFormTargetDate(e.target.value)}
                      className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* Key Results */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Key Results</label>
                      <button
                        onClick={addKR}
                        className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80"
                      >
                        <Plus size={10} />
                        Add KR
                      </button>
                    </div>
                    {formKRs.length === 0 && (
                      <p className="text-muted-foreground/60 text-[11px] py-3 text-center bg-background rounded-lg border border-dashed border-border">
                        Add measurable key results (e.g. &quot;Ship 3 features&quot;, &quot;50 customers&quot;)
                      </p>
                    )}
                    <div className="space-y-2">
                      {formKRs.map((kr, i) => (
                        <div key={kr.id} className="flex items-center gap-2 bg-background rounded-lg p-2 border border-border">
                          <input
                            value={kr.title}
                            onChange={(e) => updateKR(i, 'title', e.target.value)}
                            placeholder="Key result title"
                            className="flex-1 min-w-0 bg-transparent text-foreground text-xs outline-none"
                          />
                          <input
                            type="number"
                            value={kr.current}
                            onChange={(e) => updateKR(i, 'current', Number(e.target.value))}
                            placeholder="0"
                            className="w-14 bg-secondary rounded px-2 py-1 text-foreground text-xs outline-none text-center"
                          />
                          <span className="text-muted-foreground text-xs">/</span>
                          <input
                            type="number"
                            value={kr.target}
                            onChange={(e) => updateKR(i, 'target', Number(e.target.value))}
                            placeholder="1"
                            className="w-14 bg-secondary rounded px-2 py-1 text-foreground text-xs outline-none text-center"
                          />
                          <input
                            value={kr.unit}
                            onChange={(e) => updateKR(i, 'unit', e.target.value)}
                            placeholder="unit"
                            className="w-16 bg-secondary rounded px-2 py-1 text-foreground text-xs outline-none"
                          />
                          <button
                            onClick={() => removeKR(i)}
                            className="text-muted-foreground hover:text-red-400 p-1"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={resetForm}
                      className="px-4 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveGoal}
                      disabled={saving || !formTitle.trim()}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : editingId ? <Pencil size={12} /> : <Plus size={12} />}
                      {editingId ? 'Update' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Objectives List */}
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <div className="bg-card border border-dashed border-border rounded-xl p-10 text-center">
                  <Target size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-muted-foreground text-sm">
                    {filter === 'active' ? 'No active objectives yet' : `No ${filter} objectives`}
                  </p>
                  {filter === 'active' && (
                    <button
                      onClick={() => { resetForm(); setFormTargetDate(endOfQuarter(new Date())); setShowForm(true); }}
                      className="mt-3 text-primary text-xs hover:text-primary/80"
                    >
                      Create your first objective
                    </button>
                  )}
                </div>
              ) : (
                filtered.map(goal => {
                  const config = STATUS_CONFIG[goal.status];
                  const StatusIcon = config.icon;
                  const progress = calculateProgress(goal);
                  const daysLeft = daysBetween(goal.target_date);
                  const krs = goal.key_results || [];
                  const progressColor = progress >= 70 ? 'bg-green-500' : progress >= 30 ? 'bg-blue-500' : 'bg-orange-500';

                  return (
                    <div key={goal.id} className="bg-card border border-border rounded-xl overflow-hidden group hover:border-border/60 transition-colors">
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-foreground font-semibold text-sm">{goal.title}</h3>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider', config.bg, config.color)}>
                                <StatusIcon size={9} className="inline mr-1" />
                                {config.label}
                              </span>
                            </div>
                            {goal.description && (
                              <p className="text-muted-foreground text-xs mt-1">{goal.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              {goal.target_date && (
                                <span className={cn('text-[11px] flex items-center gap-1', daysLeft !== null && daysLeft < 7 && daysLeft >= 0 ? 'text-orange-400' : daysLeft !== null && daysLeft < 0 ? 'text-red-400' : 'text-muted-foreground')}>
                                  <CalendarIcon size={10} />
                                  {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`) : goal.target_date}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {goal.status === 'active' && (
                              <button
                                onClick={() => setStatus(goal.id, 'completed')}
                                className="p-1.5 rounded hover:bg-green-500/10 text-muted-foreground hover:text-green-400 transition-colors"
                                title="Mark complete"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => startEdit(goal)}
                              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => deleteGoal(goal.id)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Progress</span>
                            <span className="text-[11px] text-foreground font-medium">{progress}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                            <div
                              className={cn('h-full transition-all duration-500', progressColor)}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Key Results */}
                        {krs.length > 0 && (
                          <div className="space-y-2">
                            {krs.map((kr, i) => {
                              const krProgress = kr.target > 0 ? Math.min(Math.round((kr.current / kr.target) * 100), 100) : 0;
                              const atRisk = daysLeft !== null && daysLeft < 14 && krProgress < 50;
                              return (
                                <div key={kr.id} className="flex items-center gap-3 text-xs group/kr">
                                  <ChevronRight size={11} className="text-muted-foreground/40 shrink-0" />
                                  <span className="text-foreground flex-1 min-w-0 truncate">{kr.title}</span>
                                  {atRisk && <AlertTriangle size={10} className="text-orange-400 shrink-0" />}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => updateKRProgress(goal, i, kr.current - 1)}
                                      className="w-5 h-5 rounded bg-secondary hover:bg-surface-2 text-muted-foreground text-xs opacity-0 group-hover/kr:opacity-100 transition-opacity"
                                    >
                                      −
                                    </button>
                                    <span className="text-muted-foreground text-[11px] tabular-nums w-16 text-right">
                                      {kr.current}/{kr.target} {kr.unit}
                                    </span>
                                    <button
                                      onClick={() => updateKRProgress(goal, i, kr.current + 1)}
                                      className="w-5 h-5 rounded bg-secondary hover:bg-surface-2 text-muted-foreground text-xs opacity-0 group-hover/kr:opacity-100 transition-opacity"
                                    >
                                      +
                                    </button>
                                    <span className="text-[10px] text-muted-foreground/60 w-8 text-right">{krProgress}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
