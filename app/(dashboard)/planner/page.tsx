'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Calendar, CheckSquare, Focus, Coffee, Lock, Zap,
  RefreshCw, Loader2, GripVertical, ChevronLeft, ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  closestCenter,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

interface PlanBlock {
  id: string;
  time: string;
  endTime: string;
  title: string;
  type: 'calendar' | 'task' | 'focus' | 'break' | 'fitness';
  refId?: string;
  priority?: string;
  accountLabel?: string;
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
  fitness: { icon: Zap, color: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/40' },
};

const PRIORITY_DOTS: Record<string, string> = {
  urgent: 'bg-red-400',
  high: 'bg-orange-400',
  medium: 'bg-blue-400',
  low: 'bg-muted-foreground',
};

// Hours for timeline (7am - 8pm = 13 hours)
const TIMELINE_START = 7;
const TIMELINE_HOURS = 13;
const HOUR_HEIGHT = 60; // px per hour
const TIMELINE_HEIGHT = TIMELINE_HOURS * HOUR_HEIGHT; // 780px
const HOURS = Array.from({ length: TIMELINE_HOURS + 1 }, (_, i) => i + TIMELINE_START);

// Snap drops to a 15-min grid so blocks stay aligned with the timeline.
const SNAP_MINUTES = 15;

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minsToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function snap(mins: number, step: number = SNAP_MINUTES): number {
  return Math.round(mins / step) * step;
}

export default function PlannerPage() {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  // Drives the "Plan a training session" pointer — only render for users
  // who've actually onboarded into LH Fitness, otherwise it's unsolicited
  // cross-product marketing on every empty fitness day.
  const [lhfitnessActive, setLhfitnessActive] = useState(false);

  const isToday = date === new Date().toISOString().split('T')[0];

  // dnd-kit sensors: pointer for desktop, touch with 100ms longpress for
  // Capacitor mobile, keyboard for a11y. Distance/delay tuning prevents
  // accidental drags during scroll on touch.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

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

  useEffect(() => {
    let cancelled = false;
    fetch('/api/lhfitness/state')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        const profile = data?.state?.profile;
        const target = typeof profile?.weekly_target === 'number' ? profile.weekly_target : 0;
        setLhfitnessActive(Boolean(profile && target > 0));
      })
      .catch(() => { /* silent — pointer just stays hidden */ });
    return () => { cancelled = true; };
  }, []);

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

  const persistBlocks = async (newBlocks: PlanBlock[]) => {
    if (!plan) return;
    await fetch('/api/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, blocks: newBlocks, locked: plan.locked }),
    });
  };

  // Drag-to-reschedule: convert vertical drag delta to a minute delta on
  // the timeline. Snap to 15-min grid, clamp inside the visible window,
  // then sort by start time so the array reflects timeline order.
  const handleDragEnd = (event: DragEndEvent) => {
    if (!plan || plan.locked) return;
    const blockId = String(event.active.id);
    const block = plan.blocks.find(b => b.id === blockId);
    if (!block || block.locked) return;
    const dy = event.delta.y;
    if (Math.abs(dy) < 4) return; // tap, not drag

    const minutesDelta = (dy / HOUR_HEIGHT) * 60;
    const startMins = timeToMins(block.time);
    let newStart = snap(startMins + minutesDelta);

    const minStart = TIMELINE_START * 60;
    const maxStart = (TIMELINE_START + TIMELINE_HOURS) * 60 - block.duration;
    newStart = Math.max(minStart, Math.min(maxStart, newStart));
    if (newStart === startMins) return;

    const newEnd = newStart + block.duration;
    const updated: PlanBlock = { ...block, time: minsToTime(newStart), endTime: minsToTime(newEnd) };
    const newBlocks = plan.blocks
      .map(b => (b.id === blockId ? updated : b))
      .sort((a, b) => timeToMins(a.time) - timeToMins(b.time));

    setPlan({ ...plan, blocks: newBlocks });
    persistBlocks(newBlocks);
    toast.success(`Moved to ${updated.time}`);
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

  // Calculate position on timeline (pixel-based for precise rendering)
  const getBlockTop = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return ((h - TIMELINE_START) * 60 + m) / 60 * HOUR_HEIGHT;
  };

  const getBlockPxHeight = (duration: number): number => {
    return (duration / 60) * HOUR_HEIGHT;
  };

  // Current time indicator
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentPositionPx = ((currentMinutes - TIMELINE_START * 60) / 60) * HOUR_HEIGHT;
  const showCurrentTime = isToday && currentPositionPx >= 0 && currentPositionPx <= TIMELINE_HEIGHT;

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
            {/* Summary panel (left side) */}
            <div className="w-64 shrink-0 border-r border-border p-4 hidden lg:block overflow-auto">
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

                {lhfitnessActive && plan.blocks.filter(b => b.type === 'fitness').length === 0 && (
                  <a
                    href="/lhfitness/plan"
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-orange-500/20 bg-orange-500/5 text-orange-300 hover:border-orange-500/40 hover:bg-orange-500/10 transition-colors text-[11px]"
                  >
                    <Zap size={12} className="shrink-0" />
                    <span className="flex-1">No training session today.</span>
                    <span className="opacity-70">Plan one →</span>
                  </a>
                )}

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

            {/* Timeline gutter */}
            <div className="w-16 shrink-0 border-r border-border relative" style={{ height: `${TIMELINE_HEIGHT}px` }}>
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute w-full text-right pr-2"
                  style={{ top: `${(hour - TIMELINE_START) * HOUR_HEIGHT}px` }}
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
                  style={{ top: `${currentPositionPx}px` }}
                >
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                    <div className="flex-1 h-px bg-red-500/60" />
                  </div>
                </div>
              )}
            </div>

            {/* Timeline content */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
            <div className="flex-1 relative" style={{ height: `${TIMELINE_HEIGHT}px` }}>
              {/* Hour gridlines */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-border/30"
                  style={{ top: `${(hour - TIMELINE_START) * HOUR_HEIGHT}px` }}
                />
              ))}

              {/* Current time line */}
              {showCurrentTime && (
                <div
                  className="absolute left-0 right-0 z-10 h-px bg-red-500/40"
                  style={{ top: `${currentPositionPx}px` }}
                />
              )}

              {/* Plan blocks */}
              {plan.blocks.map((block) => {
                const config = TYPE_CONFIG[block.type] || TYPE_CONFIG.task;
                const Icon = config.icon;
                const topPx = getBlockTop(block.time);
                const heightPx = getBlockPxHeight(block.duration);
                const isUtility = block.type === 'break' || block.type === 'focus';
                const isCompact = heightPx < 40;

                // Breaks/focus: render as thin subtle indicators, not full blocks
                if (isUtility) {
                  return (
                    <div
                      key={block.id}
                      className="absolute left-4 right-4 flex items-center gap-2 pointer-events-none z-0"
                      style={{ top: `${topPx}px`, height: `${Math.max(heightPx, 14)}px` }}
                    >
                      <div className={cn('h-px flex-1', block.type === 'break' ? 'bg-green-500/20' : 'bg-purple-500/20')} />
                      <span className={cn('text-[9px] font-medium uppercase tracking-wider shrink-0', config.color, 'opacity-40')}>
                        {block.type === 'break' ? 'Break' : 'Focus'} · {block.duration}m
                      </span>
                      <div className={cn('h-px flex-1', block.type === 'break' ? 'bg-green-500/20' : 'bg-purple-500/20')} />
                    </div>
                  );
                }

                return (
                  <DraggablePlanBlock
                    key={block.id}
                    block={block}
                    topPx={topPx}
                    heightPx={heightPx}
                    isCompact={isCompact}
                    disabled={block.locked || plan.locked}
                    Icon={Icon}
                    bgClass={config.bg}
                    borderClass={config.border}
                    iconColor={config.color}
                  />
                );
              })}
            </div>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
}

interface DraggableBlockProps {
  block: PlanBlock;
  topPx: number;
  heightPx: number;
  isCompact: boolean;
  disabled: boolean;
  Icon: typeof Calendar;
  bgClass: string;
  borderClass: string;
  iconColor: string;
}

function DraggablePlanBlock({ block, topPx, heightPx, isCompact, disabled, Icon, bgClass, borderClass, iconColor }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    disabled,
  });

  const dy = transform?.y ?? 0;
  const top = topPx + dy;

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : listeners)}
      {...attributes}
      className={cn(
        'absolute left-2 right-2 rounded-lg border overflow-hidden z-10',
        bgClass, borderClass,
        disabled ? 'opacity-80' : 'cursor-grab active:cursor-grabbing hover:shadow-lg',
        isDragging && 'shadow-2xl ring-2 ring-primary/40 z-30 cursor-grabbing',
        !isDragging && 'transition-all',
      )}
      style={{
        top: `${top}px`,
        height: `${Math.max(heightPx - 2, 20)}px`,
        touchAction: disabled ? 'auto' : 'none',
      }}
    >
      <div className={cn('flex items-center gap-2 h-full', isCompact ? 'px-2' : 'px-3 py-1')}>
        {!disabled && <GripVertical size={isCompact ? 10 : 12} className="text-muted-foreground/40 shrink-0" />}
        <Icon size={isCompact ? 10 : 12} className={cn(iconColor, 'shrink-0')} />
        {block.priority && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOTS[block.priority])} />}
        <div className="flex-1 min-w-0">
          {isCompact ? (
            <p className="text-foreground text-[11px] font-medium truncate">
              {block.title}
              <span className="text-muted-foreground/50 ml-1.5">{block.time}</span>
            </p>
          ) : (
            <>
              <p className="text-foreground text-xs font-medium truncate">{block.title}</p>
              <p className="text-muted-foreground/60 text-[10px]">{block.time} - {block.endTime} ({block.duration}m)</p>
            </>
          )}
        </div>
        {block.locked && <Lock size={10} className="text-muted-foreground/40 shrink-0" />}
        {block.type === 'task' && block.priority === 'urgent' && (
          <AlertTriangle size={10} className="text-red-400 shrink-0" />
        )}
      </div>
    </div>
  );
}
