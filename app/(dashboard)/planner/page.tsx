'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Calendar, CheckSquare, Focus, Coffee, Lock, Zap,
  RefreshCw, Loader2, GripVertical, ChevronLeft, ChevronRight,
  AlertTriangle, CalendarDays, CalendarRange, Check, X, ExternalLink, Trash2,
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
  useDroppable,
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

interface Todo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  bucket?: string | null;
  tags?: string[] | null;
  recurrence?: string | null;
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

// Timeline: 05:00 → 22:00 (17 hours)
const TIMELINE_START = 5;
const TIMELINE_HOURS = 17;
const HOUR_HEIGHT = 60; // px per hour
const TIMELINE_HEIGHT = TIMELINE_HOURS * HOUR_HEIGHT; // 1020px
const HOURS = Array.from({ length: TIMELINE_HOURS + 1 }, (_, i) => i + TIMELINE_START);

const SNAP_MINUTES = 15;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday=0 → -6 to reach Monday
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function dateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

type View = 'day' | 'week';

export default function PlannerPage() {
  const [view, setView] = useState<View>('day');

  // Day-view state (existing)
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [date, setDate] = useState(() => dateString(new Date()));

  // Week-view state — keyed by ISO date YYYY-MM-DD
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [weekPlans, setWeekPlans] = useState<Record<string, DailyPlan | null>>({});

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  // Local optimistic-state cache: ids of tasks marked complete this session.
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());
  // Click-to-edit popout state — task block click loads the underlying todo
  // into a small dialog where Lew can edit / mark complete / open in Tasks.
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editingLoading, setEditingLoading] = useState(false);
  // Drives the "Plan a training session" pointer — only render for users
  // who've actually onboarded into LH Fitness.
  const [lhfitnessActive, setLhfitnessActive] = useState(false);

  const isToday = date === dateString(new Date());

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // ── Day-view fetch ──
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

  // ── Week-view fetch (parallel per-day, cached only) ──
  // `cached=true` so the server returns null instead of triggering 7 parallel
  // AI generations for an empty week. The user explicitly Regenerates per-day
  // from Day view if they want a plan for one of the empty cells.
  const fetchWeek = useCallback(async () => {
    setLoading(true);
    try {
      const dates = weekDates.map(dateString);
      const responses = await Promise.all(
        dates.map(d => fetch(`/api/planner?date=${d}&cached=true`).then(r => r.ok ? r.json() : null).catch(() => null)),
      );
      const next: Record<string, DailyPlan | null> = {};
      dates.forEach((d, i) => {
        next[d] = responses[i]?.plan ?? null;
      });
      setWeekPlans(next);
    } catch {
      toast.error('Failed to load week');
    }
    setLoading(false);
  }, [weekDates]);

  useEffect(() => {
    if (view === 'day') fetchPlan();
    else fetchWeek();
  }, [view, fetchPlan, fetchWeek]);

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
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const regenerate = async () => {
    setGenerating(true);
    if (view === 'day') await fetchPlan(true);
    else await fetchWeek();
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

  // Persist a single day's blocks. Throws on non-OK so callers can revert
  // optimistic state on failure.
  const persistDay = async (forDate: string, blocks: PlanBlock[], locked: boolean) => {
    const res = await fetch('/api/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: forDate, blocks, locked }),
    });
    if (!res.ok) throw new Error(`Save failed (${res.status})`);
  };

  // Click on a task block → load the underlying todo + open the edit popout.
  const openTodo = async (block: PlanBlock) => {
    if (block.type !== 'task' || !block.refId) return;
    if (completedTaskIds.has(block.refId)) return;  // already done
    setEditingTodoId(block.refId);
    setEditingTodo(null);
    setEditingLoading(true);
    try {
      const res = await fetch(`/api/todos/${block.refId}`);
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      setEditingTodo(data.todo);
    } catch {
      toast.error('Could not load task');
      setEditingTodoId(null);
    } finally {
      setEditingLoading(false);
    }
  };

  const closeTodoEditor = () => {
    setEditingTodoId(null);
    setEditingTodo(null);
  };

  // Mark complete from inside the popout. Optimistic strike-through on the
  // block, PATCH the todo, reverts on failure.
  const markTodoComplete = async () => {
    if (!editingTodoId) return;
    const id = editingTodoId;
    setCompletedTaskIds(prev => new Set(prev).add(id));
    closeTodoEditor();
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      if (!res.ok) throw new Error('failed');
      toast.success('Task marked done');
    } catch {
      setCompletedTaskIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error('Could not mark task done');
    }
  };

  // Save edits from the popout. PATCHes the todo + updates the matching
  // block titles in any plan that references it (Day or Week).
  const saveTodoEdits = async (patch: Partial<Todo>) => {
    if (!editingTodoId || !editingTodo) return;
    const id = editingTodoId;
    const optimistic = { ...editingTodo, ...patch };
    setEditingTodo(optimistic);
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('failed');
      // Reflect the new title across any block currently rendered.
      if (typeof patch.title === 'string') {
        const newTitle = patch.title;
        if (plan) {
          setPlan({ ...plan, blocks: plan.blocks.map(b => b.refId === id ? { ...b, title: newTitle } : b) });
        }
        setWeekPlans(prev => {
          const next: Record<string, DailyPlan | null> = {};
          for (const [d, p] of Object.entries(prev)) {
            if (!p) { next[d] = p; continue; }
            next[d] = { ...p, blocks: p.blocks.map(b => b.refId === id ? { ...b, title: newTitle } : b) };
          }
          return next;
        });
      }
      toast.success('Task updated');
    } catch {
      setEditingTodo(editingTodo);  // revert
      toast.error('Could not save task');
    }
  };

  const deleteTodo = async () => {
    if (!editingTodoId) return;
    if (!confirm('Delete this task? This removes it from your task list.')) return;
    const id = editingTodoId;
    closeTodoEditor();
    setCompletedTaskIds(prev => new Set(prev).add(id));  // visually drop from planner
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('failed');
      toast.success('Task deleted');
    } catch {
      setCompletedTaskIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error('Could not delete task');
    }
  };

  // ── Drag handlers ──
  // Day-view drag: vertical only (time change within the same day).
  const handleDayDragEnd = (event: DragEndEvent) => {
    if (!plan || plan.locked) return;
    const blockId = String(event.active.id);
    const block = plan.blocks.find(b => b.id === blockId);
    if (!block || block.locked) return;
    const dy = event.delta.y;
    if (Math.abs(dy) < 4) return;

    const newBlocks = applyTimeShift(plan.blocks, blockId, dy, block.duration);
    if (!newBlocks) return;
    setPlan({ ...plan, blocks: newBlocks });
    void persistDay(date, newBlocks, plan.locked);
    const moved = newBlocks.find(b => b.id === blockId)!;
    toast.success(`Moved to ${moved.time}`);
  };

  // Week-view drag: cross-column changes the date (time preserved); same-column
  // changes the time. Source + destination both saved with rollback on failure.
  const handleWeekDragEnd = async (event: DragEndEvent) => {
    // Drag ids in Week view are `${date}:${blockId}` so the same blockId on
    // different days doesn't collide in dnd-kit's draggable registry. Parse
    // out the source date directly — no need to scan all weekPlans.
    const dragId = String(event.active.id);
    const colonIdx = dragId.indexOf(':');
    if (colonIdx < 0) return;
    const sourceDate = dragId.slice(0, colonIdx);
    const blockId = dragId.slice(colonIdx + 1);
    const targetDate = event.over?.id ? String(event.over.id) : null;

    const sourcePlan = weekPlans[sourceDate] ?? null;
    if (!sourcePlan) return;
    const block = sourcePlan.blocks.find(b => b.id === blockId) ?? null;
    if (!block || sourcePlan.locked || block.locked) return;

    const dy = event.delta.y;
    const sameDay = !targetDate || targetDate === sourceDate;

    if (sameDay) {
      if (Math.abs(dy) < 4) return;
      const newBlocks = applyTimeShift(sourcePlan.blocks, blockId, dy, block.duration);
      if (!newBlocks) return;
      const prevSnapshot = weekPlans;
      setWeekPlans(prev => ({ ...prev, [sourceDate]: { ...sourcePlan!, blocks: newBlocks } }));
      try {
        await persistDay(sourceDate, newBlocks, sourcePlan.locked);
        const moved = newBlocks.find(b => b.id === blockId)!;
        toast.success(`Moved to ${moved.time}`);
      } catch {
        setWeekPlans(prevSnapshot);
        toast.error('Could not save move — reverted');
      }
      return;
    }

    // Cross-day drag — preserve time, change date.
    const destPlan = weekPlans[targetDate!];
    if (destPlan?.locked) {
      toast.error('Destination day is locked');
      return;
    }

    const sourceBlocks = sourcePlan.blocks.filter(b => b.id !== blockId);
    const destExisting = destPlan?.blocks ?? [];
    const destBlocks = [...destExisting, block]
      .sort((a, b) => timeToMins(a.time) - timeToMins(b.time));

    const prevSnapshot = weekPlans;
    setWeekPlans(prev => ({
      ...prev,
      [sourceDate]: { ...sourcePlan!, blocks: sourceBlocks },
      // Stub plan id `local-${date}`: replaced by the server-returned plan on
      // next refetch. Exists only to render optimistically until the POST
      // resolves and the row is created server-side.
      [targetDate!]: destPlan
        ? { ...destPlan, blocks: destBlocks }
        : { id: `local-${targetDate}`, plan_date: targetDate!, blocks: destBlocks, locked: false, created_at: new Date().toISOString() },
    }));
    try {
      await Promise.all([
        persistDay(sourceDate, sourceBlocks, sourcePlan.locked),
        persistDay(targetDate!, destBlocks, destPlan?.locked ?? false),
      ]);
      toast.success(`Moved to ${formatWeekday(new Date(targetDate!))}`);
    } catch {
      setWeekPlans(prevSnapshot);
      toast.error('Could not save move — reverted');
    }
  };

  // Apply a vertical pixel delta as a snapped minute shift, clamped to the
  // visible window. Returns the updated block list (sorted) or null on no-op.
  const applyTimeShift = (blocks: PlanBlock[], blockId: string, dy: number, duration: number): PlanBlock[] | null => {
    const target = blocks.find(b => b.id === blockId);
    if (!target) return null;
    const minutesDelta = (dy / HOUR_HEIGHT) * 60;
    const startMins = timeToMins(target.time);
    let newStart = snap(startMins + minutesDelta);
    const minStart = TIMELINE_START * 60;
    const maxStart = (TIMELINE_START + TIMELINE_HOURS) * 60 - duration;
    newStart = Math.max(minStart, Math.min(maxStart, newStart));
    if (newStart === startMins) return null;
    const newEnd = newStart + duration;
    return blocks
      .map(b => b.id === blockId ? { ...b, time: minsToTime(newStart), endTime: minsToTime(newEnd) } : b)
      .sort((a, b) => timeToMins(a.time) - timeToMins(b.time));
  };

  // Navigate dates / weeks
  const changeDate = (offset: number) => {
    if (view === 'day') {
      const d = new Date(date);
      d.setDate(d.getDate() + offset);
      setDate(dateString(d));
    } else {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + offset * 7);
      setWeekStart(d);
    }
  };

  const formatDateDisplay = (d: string) => {
    const dt = new Date(d + 'T12:00:00');
    if (isToday) return 'Today';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d === dateString(tomorrow)) return 'Tomorrow';
    return dt.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const formatWeekRange = () => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    const sameMonth = weekStart.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${weekStart.toLocaleDateString('en-ZA', { day: 'numeric' })}–${end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`;
    }
    return `${weekStart.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`;
  };

  // Pixel position helpers
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
  const showCurrentTime = currentPositionPx >= 0 && currentPositionPx <= TIMELINE_HEIGHT;
  const todayDateStr = dateString(new Date());

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={() => changeDate(-1)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                if (view === 'day') setDate(dateString(new Date()));
                else setWeekStart(getMonday(new Date()));
              }}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                view === 'day' && isToday ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary')}
            >
              {view === 'day' ? formatDateDisplay(date) : formatWeekRange()}
            </button>
            <button onClick={() => changeDate(1)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          {view === 'day' && (
            <span className="text-muted-foreground text-xs hidden sm:block">
              {new Date(date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-secondary rounded-lg p-0.5">
            <button
              onClick={() => setView('day')}
              className={cn('flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                view === 'day' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              <CalendarDays size={12} /> Day
            </button>
            <button
              onClick={() => setView('week')}
              className={cn('flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                view === 'week' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              <CalendarRange size={12} /> Week
            </button>
          </div>

          <button
            onClick={regenerate}
            disabled={generating || Boolean(view === 'day' && plan?.locked)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Regenerate
          </button>
          {view === 'day' && plan && !plan.locked && plan.blocks.length > 0 && (
            <button
              onClick={lockDay}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
              Lock Day
            </button>
          )}
          {view === 'day' && plan?.locked && (
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
            <p className="text-muted-foreground text-sm">{generating ? 'AI is planning…' : 'Loading…'}</p>
          </div>
        ) : view === 'day' ? (
          <DayView
            plan={plan}
            date={date}
            isToday={isToday}
            currentPositionPx={currentPositionPx}
            showCurrentTime={showCurrentTime}
            sensors={sensors}
            onDragEnd={handleDayDragEnd}
            onOpenTodo={openTodo}
            completedTaskIds={completedTaskIds}
            getBlockTop={getBlockTop}
            getBlockPxHeight={getBlockPxHeight}
            lhfitnessActive={lhfitnessActive}
            onRegenerate={regenerate}
            generating={generating}
          />
        ) : (
          <WeekView
            weekDates={weekDates}
            weekPlans={weekPlans}
            todayDateStr={todayDateStr}
            currentPositionPx={currentPositionPx}
            showCurrentTime={showCurrentTime}
            sensors={sensors}
            onDragEnd={handleWeekDragEnd}
            onOpenTodo={openTodo}
            completedTaskIds={completedTaskIds}
            getBlockTop={getBlockTop}
            getBlockPxHeight={getBlockPxHeight}
          />
        )}
      </div>

      {/* Edit-todo popout */}
      {editingTodoId && (
        <TodoEditor
          todoId={editingTodoId}
          todo={editingTodo}
          loading={editingLoading}
          onClose={closeTodoEditor}
          onMarkComplete={markTodoComplete}
          onSave={saveTodoEdits}
          onDelete={deleteTodo}
        />
      )}
    </div>
  );
}

// ── Todo editor popout ────────────────────────────────────────────────

interface TodoEditorProps {
  todoId: string;
  todo: Todo | null;
  loading: boolean;
  onClose: () => void;
  onMarkComplete: () => void;
  onSave: (patch: Partial<Todo>) => void;
  onDelete: () => void;
}

function TodoEditor({ todoId, todo, loading, onClose, onMarkComplete, onSave, onDelete }: TodoEditorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');

  // Populate form when the todo loads (or changes).
  useEffect(() => {
    if (todo) {
      setTitle(todo.title);
      setDescription(todo.description ?? '');
      setPriority(todo.priority);
      setDueDate(todo.due_date ?? '');
    }
  }, [todo]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dirty = todo && (
    title !== todo.title ||
    description !== (todo.description ?? '') ||
    priority !== todo.priority ||
    dueDate !== (todo.due_date ?? '')
  );

  const handleSave = () => {
    if (!todo || !dirty) return;
    const patch: Partial<Todo> = {};
    if (title !== todo.title) patch.title = title;
    if (description !== (todo.description ?? '')) patch.description = description || null;
    if (priority !== todo.priority) patch.priority = priority;
    if (dueDate !== (todo.due_date ?? '')) patch.due_date = dueDate || null;
    onSave(patch);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !todo ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <CheckSquare size={14} className="text-orange-400" />
                <h3 className="text-foreground font-semibold text-sm">Task</h3>
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                title="Close (Esc)"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-muted-foreground text-[10px] uppercase tracking-wider">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  placeholder="Task title"
                />
              </div>

              <div>
                <label className="text-muted-foreground text-[10px] uppercase tracking-wider">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none"
                  placeholder="Add details (optional)"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground text-[10px] uppercase tracking-wider">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="text-muted-foreground text-[10px] uppercase tracking-wider">Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-background/40">
              <div className="flex items-center gap-2">
                <button
                  onClick={onDelete}
                  className="text-muted-foreground hover:text-red-400 p-1.5 rounded transition-colors"
                  title="Delete task"
                >
                  <Trash2 size={14} />
                </button>
                <a
                  href="/todos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 transition-colors"
                  title="Open in Tasks"
                >
                  <ExternalLink size={11} /> Tasks
                </a>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onMarkComplete}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
                >
                  <Check size={12} /> Mark complete
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty}
                  className="px-3 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save changes
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {/* todoId reserved for future use (e.g., showing the id in a debug footer) */}
      <span className="sr-only">{todoId}</span>
    </div>
  );
}

// ── Day view ───────────────────────────────────────────────────────────

interface DayViewProps {
  plan: DailyPlan | null;
  date: string;
  isToday: boolean;
  currentPositionPx: number;
  showCurrentTime: boolean;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (e: DragEndEvent) => void;
  onOpenTodo: (b: PlanBlock) => void;
  completedTaskIds: Set<string>;
  getBlockTop: (time: string) => number;
  getBlockPxHeight: (duration: number) => number;
  lhfitnessActive: boolean;
  onRegenerate: () => void;
  generating: boolean;
}

function DayView(props: DayViewProps) {
  const { plan, isToday, currentPositionPx, showCurrentTime, sensors, onDragEnd, onOpenTodo, completedTaskIds, getBlockTop, getBlockPxHeight, lhfitnessActive, onRegenerate, generating } = props;

  if (!plan || plan.blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Calendar size={40} className="text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">No plan for this day</p>
        <button
          onClick={onRegenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Generate Plan
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Summary panel (left side) */}
      <div className="w-64 shrink-0 border-r border-border p-4 hidden lg:block overflow-auto">
        <h3 className="text-foreground font-semibold text-sm mb-3">Day Summary</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label="Meetings" value={String(plan.blocks.filter(b => b.type === 'calendar').length)} />
            <SummaryTile label="Tasks" value={String(plan.blocks.filter(b => b.type === 'task').length)} />
            <SummaryTile label="Focus" value={String(plan.blocks.filter(b => b.type === 'focus').length)} />
            <SummaryTile label="Total" value={`${Math.round(plan.blocks.reduce((s, b) => s + b.duration, 0) / 60)}h`} />
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

          <div>
            <h4 className="text-muted-foreground text-[10px] uppercase tracking-wider mb-2">Schedule</h4>
            <div className="space-y-1">
              {plan.blocks.map((block) => {
                const config = TYPE_CONFIG[block.type] || TYPE_CONFIG.task;
                const Icon = config.icon;
                const isDone = block.refId ? completedTaskIds.has(block.refId) : false;
                return (
                  <div key={block.id} className="flex items-center gap-2 py-1">
                    <Icon size={10} className={config.color} />
                    <span className="text-muted-foreground text-[10px] w-10 shrink-0">{block.time}</span>
                    <span className={cn('text-foreground text-[11px] truncate flex-1', isDone && 'line-through opacity-60')}>{block.title}</span>
                    <span className="text-muted-foreground/60 text-[10px] shrink-0">{block.duration}m</span>
                  </div>
                );
              })}
            </div>
          </div>

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
            <p className="text-muted-foreground/50 text-[10px] mt-3 leading-relaxed">
              Tip: click a task block to mark it done.
            </p>
          </div>
        </div>
      </div>

      {/* Timeline gutter */}
      <TimelineGutter showCurrentTime={isToday && showCurrentTime} currentPositionPx={currentPositionPx} />

      {/* Timeline content */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
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
          {isToday && showCurrentTime && (
            <div
              className="absolute left-0 right-0 z-10 h-px bg-red-500/40"
              style={{ top: `${currentPositionPx}px` }}
            />
          )}

          {plan.blocks.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              dragId={block.id}
              dayLocked={plan.locked}
              topPx={getBlockTop(block.time)}
              heightPx={getBlockPxHeight(block.duration)}
              done={block.refId ? completedTaskIds.has(block.refId) : false}
              onOpenTodo={onOpenTodo}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

// ── Week view ──────────────────────────────────────────────────────────

interface WeekViewProps {
  weekDates: Date[];
  weekPlans: Record<string, DailyPlan | null>;
  todayDateStr: string;
  currentPositionPx: number;
  showCurrentTime: boolean;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (e: DragEndEvent) => void;
  onOpenTodo: (b: PlanBlock) => void;
  completedTaskIds: Set<string>;
  getBlockTop: (time: string) => number;
  getBlockPxHeight: (duration: number) => number;
}

function WeekView(props: WeekViewProps) {
  const { weekDates, weekPlans, todayDateStr, currentPositionPx, showCurrentTime, sensors, onDragEnd, onOpenTodo, completedTaskIds, getBlockTop, getBlockPxHeight } = props;

  const totalBlocks = Object.values(weekPlans).reduce((sum, p) => sum + (p?.blocks.length ?? 0), 0);
  const totalHours = Math.round(
    Object.values(weekPlans).reduce((sum, p) => sum + (p?.blocks ?? []).reduce((s, b) => s + b.duration, 0), 0) / 60,
  );

  // Current-time line only renders when the displayed week actually contains
  // today — otherwise the gutter dot would float on a Monday two weeks ago.
  const weekContainsToday = weekDates.some(d => dateString(d) === todayDateStr);
  const showWeekCurrentTime = showCurrentTime && weekContainsToday;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Compact summary bar */}
      <div className="px-6 py-2 border-b border-border flex items-center gap-6 text-[11px] text-muted-foreground shrink-0 flex-wrap">
        <span><span className="text-foreground font-semibold">{totalBlocks}</span> blocks</span>
        <span><span className="text-foreground font-semibold">{totalHours}h</span> total</span>
        <span className="text-muted-foreground/50 hidden md:inline">Drag a block across columns to move it to another day · click a task to mark done</span>
      </div>

      {/* Timeline + day columns. Horizontal scroll on narrow viewports so 7
          columns stay legible on mobile rather than collapsing to ~50px each. */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col min-w-[840px]">
          {/* Day-of-week header strip */}
          <div className="flex border-b border-border shrink-0 sticky top-0 bg-background z-20">
            <div className="w-16 shrink-0 border-r border-border" />
            {weekDates.map((d, i) => {
              const ds = dateString(d);
              const isCurrent = ds === todayDateStr;
              const isLocked = weekPlans[ds]?.locked === true;
              return (
                <div
                  key={ds}
                  className={cn(
                    'flex-1 px-2 py-2 text-center border-r border-border last:border-r-0 min-w-0',
                    isCurrent && 'bg-primary/5',
                  )}
                >
                  <p className={cn('text-[10px] uppercase tracking-wider', isCurrent ? 'text-primary' : 'text-muted-foreground')}>{WEEKDAYS[i]}</p>
                  <div className="flex items-center justify-center gap-1">
                    <p className={cn('text-sm font-semibold', isCurrent ? 'text-primary' : 'text-foreground')}>{d.getDate()}</p>
                    {isLocked && <Lock size={10} className="text-green-400" />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex" style={{ height: `${TIMELINE_HEIGHT}px` }}>
            <TimelineGutter showCurrentTime={showWeekCurrentTime} currentPositionPx={currentPositionPx} />
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <div className="flex-1 flex">
                {weekDates.map((d) => {
                  const ds = dateString(d);
                  const dayPlan = weekPlans[ds];
                  const isCurrent = ds === todayDateStr;
                  return (
                    <DayColumn
                      key={ds}
                      date={ds}
                      plan={dayPlan ?? null}
                      isToday={isCurrent}
                      currentPositionPx={currentPositionPx}
                      showCurrentTime={showCurrentTime}
                      onOpenTodo={onOpenTodo}
                      completedTaskIds={completedTaskIds}
                      getBlockTop={getBlockTop}
                      getBlockPxHeight={getBlockPxHeight}
                    />
                  );
                })}
              </div>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DayColumnProps {
  date: string;
  plan: DailyPlan | null;
  isToday: boolean;
  currentPositionPx: number;
  showCurrentTime: boolean;
  onOpenTodo: (b: PlanBlock) => void;
  completedTaskIds: Set<string>;
  getBlockTop: (time: string) => number;
  getBlockPxHeight: (duration: number) => number;
}

function DayColumn(props: DayColumnProps) {
  const { date, plan, isToday, currentPositionPx, showCurrentTime, onOpenTodo, completedTaskIds, getBlockTop, getBlockPxHeight } = props;
  const { setNodeRef, isOver } = useDroppable({ id: date });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 relative border-r border-border last:border-r-0 min-w-0',
        isOver && 'bg-primary/5',
        isToday && 'bg-primary/[0.02]',
      )}
      style={{ height: `${TIMELINE_HEIGHT}px` }}
    >
      {/* Hour gridlines */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border/30"
          style={{ top: `${(hour - TIMELINE_START) * HOUR_HEIGHT}px` }}
        />
      ))}

      {/* Current time indicator (today only) */}
      {isToday && showCurrentTime && (
        <div
          className="absolute left-0 right-0 z-10 h-px bg-red-500/40"
          style={{ top: `${currentPositionPx}px` }}
        />
      )}

      {(plan?.blocks ?? []).map((block) => (
        <BlockRenderer
          key={`${date}:${block.id}`}
          block={block}
          dragId={`${date}:${block.id}`}
          dayLocked={plan?.locked ?? false}
          topPx={getBlockTop(block.time)}
          heightPx={getBlockPxHeight(block.duration)}
          done={block.refId ? completedTaskIds.has(block.refId) : false}
          onOpenTodo={onOpenTodo}
          compact
        />
      ))}
    </div>
  );
}

// ── Block renderer (shared) ────────────────────────────────────────────

interface BlockRendererProps {
  block: PlanBlock;
  /**
   * Unique drag id for dnd-kit. In Day view this is just `block.id`; in Week
   * view it MUST be `${date}:${block.id}` so the same block.id on different
   * days doesn't collide in dnd-kit's draggable registry (which would cause
   * "drag one, drag many" — every block sharing the id moves together).
   */
  dragId: string;
  dayLocked: boolean;
  topPx: number;
  heightPx: number;
  done: boolean;
  onOpenTodo: (b: PlanBlock) => void;
  compact?: boolean;
}

function BlockRenderer({ block, dragId, dayLocked, topPx, heightPx, done, onOpenTodo, compact }: BlockRendererProps) {
  const config = TYPE_CONFIG[block.type] || TYPE_CONFIG.task;
  const Icon = config.icon;
  const isUtility = block.type === 'break' || block.type === 'focus';
  const isCompact = compact || heightPx < 40;

  // Breaks/focus: render as thin subtle indicators, not full blocks
  if (isUtility) {
    return (
      <div
        className="absolute left-2 right-2 flex items-center gap-2 pointer-events-none z-0"
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
      block={block}
      dragId={dragId}
      topPx={topPx}
      heightPx={heightPx}
      isCompact={isCompact}
      disabled={block.locked || dayLocked}
      Icon={Icon}
      bgClass={config.bg}
      borderClass={config.border}
      iconColor={config.color}
      done={done}
      onOpenTodo={onOpenTodo}
    />
  );
}

// ── Draggable block ────────────────────────────────────────────────────

interface DraggableBlockProps {
  block: PlanBlock;
  dragId: string;
  topPx: number;
  heightPx: number;
  isCompact: boolean;
  disabled: boolean;
  Icon: typeof Calendar;
  bgClass: string;
  borderClass: string;
  iconColor: string;
  done: boolean;
  onOpenTodo: (b: PlanBlock) => void;
}

function DraggablePlanBlock({ block, dragId, topPx, heightPx, isCompact, disabled, Icon, bgClass, borderClass, iconColor, done, onOpenTodo }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled,
  });

  const dx = transform?.x ?? 0;
  const dy = transform?.y ?? 0;
  const isClickable = block.type === 'task' && !done && !disabled;

  // Suppress the click-after-drag double fire — dnd-kit clears `isDragging`
  // before the synthetic click fires on pointer-up at the end of a real drag,
  // so the `!isDragging` guard alone isn't enough. Track whether a drag
  // actually moved the block past the activation distance, and consume the
  // next click after that.
  const wasDraggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) wasDraggedRef.current = true;
  }, [isDragging]);

  const handleClick = () => {
    if (wasDraggedRef.current) {
      // Reset on next tick so a subsequent genuine click still fires.
      setTimeout(() => { wasDraggedRef.current = false; }, 0);
      return;
    }
    if (isClickable) onOpenTodo(block);
  };

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : listeners)}
      {...attributes}
      onClick={isClickable ? handleClick : undefined}
      className={cn(
        'absolute left-2 right-2 rounded-lg border overflow-hidden z-10',
        bgClass, borderClass,
        disabled ? 'opacity-80' : 'cursor-grab active:cursor-grabbing hover:shadow-lg',
        isDragging && 'shadow-2xl ring-2 ring-primary/40 z-30 cursor-grabbing',
        !isDragging && 'transition-all',
        done && 'opacity-50',
      )}
      style={{
        top: `${topPx + dy}px`,
        transform: dx ? `translateX(${dx}px)` : undefined,
        height: `${Math.max(heightPx - 2, 20)}px`,
        touchAction: disabled ? 'auto' : 'none',
      }}
    >
      <div className={cn('flex items-center gap-2 h-full', isCompact ? 'px-2' : 'px-3 py-1')}>
        {!disabled && <GripVertical size={isCompact ? 10 : 12} className="text-muted-foreground/40 shrink-0" />}
        {done ? (
          <Check size={isCompact ? 10 : 12} className="text-emerald-400 shrink-0" />
        ) : (
          <Icon size={isCompact ? 10 : 12} className={cn(iconColor, 'shrink-0')} />
        )}
        {block.priority && !done && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOTS[block.priority])} />}
        <div className="flex-1 min-w-0">
          {isCompact ? (
            <p className={cn('text-foreground text-[11px] font-medium truncate', done && 'line-through')}>
              {block.title}
              <span className="text-muted-foreground/50 ml-1.5">{block.time}</span>
            </p>
          ) : (
            <>
              <p className={cn('text-foreground text-xs font-medium truncate', done && 'line-through')}>{block.title}</p>
              <p className="text-muted-foreground/60 text-[10px]">{block.time} - {block.endTime} ({block.duration}m)</p>
            </>
          )}
        </div>
        {block.locked && <Lock size={10} className="text-muted-foreground/40 shrink-0" />}
        {block.type === 'task' && block.priority === 'urgent' && !done && (
          <AlertTriangle size={10} className="text-red-400 shrink-0" />
        )}
      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg p-2.5 border border-border">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-foreground text-lg font-bold">{value}</p>
    </div>
  );
}

function TimelineGutter({ showCurrentTime, currentPositionPx }: { showCurrentTime: boolean; currentPositionPx: number }) {
  return (
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
      {showCurrentTime && (
        <div className="absolute left-0 right-0 z-10" style={{ top: `${currentPositionPx}px` }}>
          <div className="flex items-center">
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
            <div className="flex-1 h-px bg-red-500/60" />
          </div>
        </div>
      )}
    </div>
  );
}

function formatWeekday(d: Date): string {
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}
