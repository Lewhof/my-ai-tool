'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatRelativeDate } from '@/lib/utils';
import { Bot, Plus, Play, Pause, Trash2, Loader2, Clock, Zap, Hand } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schedule: string | null;
  trigger_type: string;
  trigger_event: string | null;
  actions: Array<{ type: string }>;
  enabled: boolean;
  last_run_at: string | null;
  run_count: number;
  last_run: { status: string; created_at: string } | null;
  created_at: string;
}

const TRIGGER_ICONS: Record<string, typeof Clock> = {
  scheduled: Clock,
  event: Zap,
  manual: Hand,
};

const SCHEDULE_OPTIONS = [
  { value: '*/5', label: 'Every 5 minutes' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const ACTION_OPTIONS = [
  { value: 'save_note', label: 'Save as Note' },
  { value: 'create_todo', label: 'Create Task' },
  { value: 'update_whiteboard', label: 'Add to Whiteboard' },
  { value: 'send_telegram', label: 'Send via Telegram' },
];

const TEMPLATES = [
  { name: 'Morning Briefing', description: 'Daily summary of tasks, calendar, and priorities', prompt: 'Generate a morning briefing. List my overdue tasks, tasks due today, and suggest top 3 priorities. Include weather.', schedule: 'daily', trigger_type: 'scheduled', actions: [{ type: 'save_note' }] },
  { name: 'Weekly Review', description: 'End-of-week summary and next week planning', prompt: 'Generate a weekly review. Summarize what was completed this week, what is still pending, and suggest priorities for next week.', schedule: 'weekly', trigger_type: 'scheduled', actions: [{ type: 'save_note' }] },
  { name: 'Whiteboard Cleanup', description: 'Review stale items and suggest actions', prompt: 'Review all whiteboard items. Flag any that have been in "idea" status for over 14 days. Suggest which should be moved to "scoped" or "parked".', schedule: 'weekly', trigger_type: 'scheduled', actions: [{ type: 'save_note' }] },
];

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newSchedule, setNewSchedule] = useState('daily');
  const [newTriggerType, setNewTriggerType] = useState('manual');
  const [newTriggerEvent, setNewTriggerEvent] = useState('document.uploaded');
  const [newActions, setNewActions] = useState<string[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const createAgent = async () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName,
        description: newDesc || null,
        prompt: newPrompt,
        schedule: newTriggerType === 'scheduled' ? newSchedule : null,
        trigger_type: newTriggerType,
        trigger_event: newTriggerType === 'event' ? newTriggerEvent : null,
        actions: newActions.map((a) => ({ type: a })),
      }),
    });
    setNewName(''); setNewDesc(''); setNewPrompt(''); setNewActions([]);
    setShowCreate(false);
    fetchAgents();
  };

  const createFromTemplate = async (template: typeof TEMPLATES[0]) => {
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    fetchAgents();
  };

  const runAgent = async (id: string) => {
    setRunningId(id);
    await fetch(`/api/agents/${id}/run`, { method: 'POST' });
    setRunningId(null);
    fetchAgents();
  };

  const toggleAgent = async (id: string, enabled: boolean) => {
    await fetch(`/api/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    fetchAgents();
  };

  const deleteAgent = async (id: string) => {
    if (!confirm('Delete this agent?')) return;
    await fetch(`/api/agents/${id}`, { method: 'DELETE' });
    setAgents((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Agents</h2>
          <p className="text-muted-foreground text-sm mt-1">Autonomous AI agents that work for you</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors flex items-center gap-2">
          <Plus size={16} />
          {showCreate ? 'Cancel' : 'New Agent'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-foreground text-sm block mb-1">Agent Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Morning Briefing" className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Trigger Type</label>
              <select value={newTriggerType} onChange={(e) => setNewTriggerType(e.target.value)} className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm">
                <option value="manual">Manual (run on demand)</option>
                <option value="scheduled">Scheduled (cron)</option>
                <option value="event">Event-driven (trigger)</option>
              </select>
            </div>
          </div>
          {newTriggerType === 'scheduled' && (
            <div>
              <label className="text-foreground text-sm block mb-1">Schedule</label>
              <select value={newSchedule} onChange={(e) => setNewSchedule(e.target.value)} className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm">
                {SCHEDULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {newTriggerType === 'event' && (
            <div>
              <label className="text-foreground text-sm block mb-1">Trigger Event</label>
              <select value={newTriggerEvent} onChange={(e) => setNewTriggerEvent(e.target.value)} className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm">
                <option value="document.uploaded">Document uploaded</option>
                <option value="whiteboard.created">Whiteboard item created</option>
                <option value="todo.overdue">Task overdue</option>
                <option value="email.important">Important email received</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-foreground text-sm block mb-1">Description</label>
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What does this agent do?" className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-foreground text-sm block mb-1">Prompt</label>
            <textarea value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} rows={4} placeholder="What should this agent do when it runs?" className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
          <div>
            <label className="text-foreground text-sm block mb-1">Actions (after execution)</label>
            <div className="flex gap-2 flex-wrap">
              {ACTION_OPTIONS.map((a) => (
                <button key={a.value} onClick={() => setNewActions((prev) => prev.includes(a.value) ? prev.filter((x) => x !== a.value) : [...prev, a.value])}
                  className={cn('text-xs px-3 py-1.5 rounded-lg border transition-colors', newActions.includes(a.value) ? 'bg-primary/15 border-primary/50 text-primary' : 'border-border text-muted-foreground hover:border-white/15')}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={createAgent} disabled={!newName.trim() || !newPrompt.trim()} className="bg-primary text-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary disabled:opacity-50">Create Agent</button>
        </div>
      )}

      {/* Templates */}
      {agents.length === 0 && !showCreate && (
        <div>
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-3">Quick Start Templates</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button key={t.name} onClick={() => createFromTemplate(t)} className="bg-card border border-border rounded-lg p-4 text-left hover:border-primary/50 transition-colors">
                <p className="text-foreground font-medium text-sm">{t.name}</p>
                <p className="text-muted-foreground text-xs mt-1">{t.description}</p>
                <p className="text-primary text-xs mt-2">Click to create</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Agent list */}
      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
      ) : agents.length > 0 ? (
        <div className="space-y-3">
          {agents.map((agent) => {
            const TriggerIcon = TRIGGER_ICONS[agent.trigger_type] || Hand;
            return (
              <div key={agent.id} className="bg-card border border-border rounded-lg p-5 hover:border-border transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', agent.enabled ? 'bg-primary/15' : 'bg-secondary')}>
                      <Bot size={18} className={agent.enabled ? 'text-primary' : 'text-muted-foreground'} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-foreground font-medium text-sm">{agent.name}</p>
                        <span className={cn('text-xs px-2 py-0.5 rounded flex items-center gap-1', agent.enabled ? 'bg-green-500/20 text-green-400' : 'bg-secondary text-muted-foreground')}>
                          <TriggerIcon size={10} />
                          {agent.trigger_type}
                        </span>
                        {agent.schedule && <span className="text-muted-foreground text-xs">{agent.schedule}</span>}
                      </div>
                      {agent.description && <p className="text-muted-foreground text-xs mt-0.5">{agent.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-muted-foreground/60 text-xs">
                        <span>{agent.run_count} runs</span>
                        {agent.last_run_at && <span>Last: {formatRelativeDate(agent.last_run_at)}</span>}
                        {agent.last_run && <span className={agent.last_run.status === 'completed' ? 'text-green-400' : 'text-red-400'}>{agent.last_run.status}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => runAgent(agent.id)} disabled={runningId === agent.id} className="text-muted-foreground hover:text-primary p-1.5 rounded hover:bg-secondary transition-colors disabled:animate-pulse" title="Run now">
                      {runningId === agent.id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                    </button>
                    <button onClick={() => toggleAgent(agent.id, agent.enabled)} className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-secondary transition-colors" title={agent.enabled ? 'Disable' : 'Enable'}>
                      {agent.enabled ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <button onClick={() => deleteAgent(agent.id)} className="text-muted-foreground hover:text-red-400 p-1.5 rounded hover:bg-secondary transition-colors" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
