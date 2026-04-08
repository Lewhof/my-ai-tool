'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Calendar, Clock, CheckSquare, Focus, Coffee, Lock,
  RefreshCw, Loader2, GripVertical, ChevronLeft, ChevronRight,
  AlertTriangle,
} from 'lucide-react';

interface PlanBlock {
  id: string;
  time: string;
  endTime: string;
  title: string;
  type: 'calendar' | 'task' | 'focus' | 'break';
  refId?: string;
  priority?: string;
  locked: boolean;
  duration: number;
}

interface DailyPlan {
  id: string;
  plan_date: string;
  blocks: PlanBlock[];
  locked: boolean;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Calendar; color: string; bg: string; border: string }> = {
  calendar: { icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  task: { icon: CheckSquare, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  focus: { icon: Focus, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  break: { icon: Coffee, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
};

const PRIORITY_DOTS: Record<string, string> = {
  urgent: 'bg-red-400',
  high: 'bg-orange-400',
  medium: 'bg-blue-400',
  low: 'bg-muted-foreground',
};

// Hours for timeline (7am - 7pm)
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7);

export default function PlannerPage() {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const isToday = date === new Date().toISOString().split('T')[0];

  const fetchPlan = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (refresh) params.set('refresh', 'true');
      const res = await fetch(`/api/planner?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
        if (data.source === 'generated') {
          toast.success('Daily plan generated');
        }
      }
    } catch {
      toast.error('Failed to load plan');
    }
    setLoading(false);
  }, [date]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  const regenerate = async () => {
    setGenerating(true);
    await fetchPlan(true);
    setGenerating(false);
  };

  const lockDay = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const res = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, blocks: plan.blocks, locked: true }),
      });
      if (res.ok) {
        setPlan(prev => prev ? { ...prev, locked: true } : null);
        toast.success('Day locked');
      }
    } catch {
      toast.error('Failed to lock day');
    }
    setSaving(false);
  };

  const saveOrder = async (newBlocks: PlanBlock[]) => {
    if (!plan) return;
    setPlan(prev => prev ? { ...prev, blocks: newBlocks } : null);
    await fetch('/api/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, blocks: newBlocks, locked: plan.locked }),
    });
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    if (plan?.locked) return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    if (!plan) return;

    const blocks = [...plan.blocks];
    const dragged = blocks[draggedIndex];

    // Don't allow moving locked (calendar) items
    if (dragged.locked) return;

    blocks.splice(draggedIndex, 1);
    blocks.splice(index, 0, dragged);
    setPlan({ ...plan, blocks });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (plan && draggedIndex !== null) {
      saveOrder(plan.blocks);
    }
    setDraggedIndex(null);
  };

  // Navigate dates
  const changeDate = (offset: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    setDate(d.toISOString().split('T')[0]);
  };

  const formatDateDisplay = (d: string) => {
    const dt = new Date(d + 'T12:00:00');
    if (isToday) return 'Today';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
    return dt.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Calculate position on timeline
  const getBlockPosition = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return ((h - 7) * 60 + m) / (13 * 60) * 100; // 7am-7pm = 13 hours
  };

  const getBlockHeight = (duration: number) => {
    return (duration / (13 * 60)) * 100;
  };

  // Current time indicator
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentPosition = ((currentMinutes - 7 * 60) / (13 * 60)) * 100;
  const showCurrentTime = isToday && currentPosition >= 0 && currentPosition <= 100;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={() => changeDate(-1)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setDate(new Date().toISOString().split('T')[0])}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors', isToday ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary')}
            >
              {formatDateDisplay(date)}
            </button>
            <button onClick={() => changeDate(1)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="text-muted-foreground text-xs hidden sm:block">
            {new Date(date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={regenerate}
            disabled={generating || plan?.locked}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Regenerate
          </button>
          {plan && !plan.locked && plan.blocks.length > 0 && (
            <button
              onClick={lockDay}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
              Lock Day
            </button>
          )}
          {plan?.locked && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-green-500/10 text-green-400 border border-green-500/30">
              <Lock size={10} />
              Day Locked
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={24} className="animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">{generating ? 'AI is planning your day...' : 'Loading plan...'}</p>
          </div>
        ) : !plan || plan.blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Calendar size={40} className="text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">No plan for this day</p>
            <button
              onClick={regenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Generate Plan
            </button>
          </div>
        ) : (
          <div className="flex h-full">
            {/* Timeline gutter */}
            <div className="w-16 shrink-0 border-r border-border relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute w-full text-right pr-2"
                  style={{ top: `${((hour - 7) / 13) * 100}%` }}
                >
                  <span className="text-[10px] text-muted-foreground/60 -translate-y-1/2 inline-block">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
              ))}
              {/* Current time indicator */}
              {showCurrentTime && (
                <div
                  className="absolute left-0 right-0 z-10"
                  style={{ top: `${currentPosition}%` }}
                >
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                    <div className="flex-1 h-px bg-red-500/60" />
                  </div>
                </div>
              )}
            </div>

            {/* Timeline content */}
            <div className="flex-1 relative" style={{ minHeight: '780px' }}>
              {/* Hour gridlines */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-border/30"
                  style={{ top: `${((hour - 7) / 13) * 100}%` }}
                />
              ))}

              {/* Current time line */}
              {showCurrentTime && (
                <div
                  className="absolute left-0 right-0 z-10 h-px bg-red-500/40"
                  style={{ top: `${currentPosition}%` }}
                />
              )}

              {/* Plan blocks */}
              {plan.blocks.map((block, index) => {
                const config = TYPE_CONFIG[block.type] || TYPE_CONFIG.task;
                const Icon = config.icon;
                const top = getBlockPosition(block.time);
                const height = getBlockHeight(block.duration);

                return (
                  <div
                    key={block.id}
                    draggable={!block.locked && !plan.locked}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'absolute left-2 right-2 rounded-lg border px-3 py-1.5 transition-all',
                      config.bg, config.border,
                      block.locked ? 'opacity-80' : 'cursor-grab active:cursor-grabbing hover:shadow-lg',
                      draggedIndex === index && 'opacity-50 scale-95',
                    )}
                    style={{
                      top: `${top}%`,
                      minHeight: `${Math.max(height, 3)}%`,
                    }}
                  >
                    <div className="flex items-center gap-2 h-full">
                      {!block.locked && !plan.locked && (
                        <GripVertical size={12} className="text-muted-foreground/40 shrink-0" />
                      )}
                      <Icon size={12} className={cn(config.color, 'shrink-0')} />
                      {block.priority && (
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOTS[block.priority])} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-xs font-medium truncate">{block.title}</p>
                        <p className="text-muted-foreground/60 text-[10px]">{block.time} - {block.endTime} ({block.duration}m)</p>
                      </div>
                      {block.locked && <Lock size={10} className="text-muted-foreground/40 shrink-0" />}
                      {block.type === 'task' && block.priority === 'urgent' && (
                        <AlertTriangle size={10} className="text-red-400 shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary panel */}
            <div className="w-64 shrink-0 border-l border-border p-4 hidden lg:block overflow-auto">
              <h3 className="text-foreground font-semibold text-sm mb-3">Day Summary</h3>

              <div className="space-y-3">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-card rounded-lg p-2.5 border border-border">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Meetings</p>
                    <p className="text-foreground text-lg font-bold">{plan.blocks.filter(b => b.type === 'calendar').length}</p>
                  </div>
                  <div className="bg-card rounded-lg p-2.5 border border-border">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Tasks</p>
                    <p className="text-foreground text-lg font-bold">{plan.blocks.filter(b => b.type === 'task').length}</p>
                  </div>
                  <div className="bg-card rounded-lg p-2.5 border border-border">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Focus</p>
                    <p className="text-foreground text-lg font-bold">{plan.blocks.filter(b => b.type === 'focus').length}</p>
                  </div>
                  <div className="bg-card rounded-lg p-2.5 border border-border">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Total</p>
                    <p className="text-foreground text-lg font-bold">{Math.round(plan.blocks.reduce((s, b) => s + b.duration, 0) / 60)}h</p>
                  </div>
                </div>

                {/* Block list (compact) */}
                <div>
                  <h4 className="text-muted-foreground text-[10px] uppercase tracking-wider mb-2">Schedule</h4>
                  <div className="space-y-1">
                    {plan.blocks.map((block) => {
                      const config = TYPE_CONFIG[block.type] || TYPE_CONFIG.task;
                      const Icon = config.icon;
                      return (
                        <div key={block.id} className="flex items-center gap-2 py-1">
                          <Icon size={10} className={config.color} />
                          <span className="text-muted-foreground text-[10px] w-10 shrink-0">{block.time}</span>
                          <span className="text-foreground text-[11px] truncate flex-1">{block.title}</span>
                          <span className="text-muted-foreground/60 text-[10px] shrink-0">{block.duration}m</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className="pt-3 border-t border-border">
                  <h4 className="text-muted-foreground text-[10px] uppercase tracking-wider mb-2">Legend</h4>
                  <div className="space-y-1.5">
                    {Object.entries(TYPE_CONFIG).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <Icon size={10} className={config.color} />
                          <span className="text-muted-foreground text-[11px] capitalize">{key}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
