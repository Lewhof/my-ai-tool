'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';
import { toast } from 'sonner';
import EntityLinks from '@/components/entity-links';

interface Todo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  bucket: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const STATUS_COLUMNS = [
  { key: 'todo', label: 'To Do', color: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  { key: 'in-progress', label: 'In Progress', color: 'border-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
];

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  low: 'bg-muted text-muted-foreground border-border',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const ALL_STATUSES = [
  { key: 'todo', label: 'To Do' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

// ── Helpers ──

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function daysFromNow(d: string): number {
  const date = new Date(d + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - now.getTime()) / 86400000);
}

function sortByPriorityAndDue(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    // Overdue first
    const aDays = a.due_date ? daysFromNow(a.due_date) : 999;
    const bDays = b.due_date ? daysFromNow(b.due_date) : 999;
    const aOverdue = aDays < 0 ? 0 : 1;
    const bOverdue = bDays < 0 ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    // Then by priority
    const aPri = PRIORITY_ORDER[a.priority] ?? 5;
    const bPri = PRIORITY_ORDER[b.priority] ?? 5;
    if (aPri !== bPri) return aPri - bPri;

    // Then by due date (soonest first)
    if (aDays !== bDays) return aDays - bDays;

    return 0;
  });
}

type DueGroup = 'overdue' | 'today' | 'this-week' | 'later' | 'no-date';

function getDueGroup(todo: Todo): DueGroup {
  if (!todo.due_date) return 'no-date';
  const days = daysFromNow(todo.due_date);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'this-week';
  return 'later';
}

const DUE_GROUP_CONFIG: Record<DueGroup, { label: string; color: string; icon: string }> = {
  overdue:     { label: 'Overdue',    color: 'text-red-400',              icon: '!!' },
  today:       { label: 'Today',      color: 'text-yellow-400',           icon: '\u2022' },
  'this-week': { label: 'This Week',  color: 'text-blue-400',             icon: '\u2022' },
  later:       { label: 'Later',      color: 'text-muted-foreground',     icon: '\u2022' },
  'no-date':   { label: 'No Due Date', color: 'text-muted-foreground/60', icon: '\u2013' },
};

// ── Main Component ──

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [viewMode, setViewMode] = useState<'planner' | 'table'>('table');
  const [showAdd, setShowAdd] = useState(false);
  const [addToColumn, setAddToColumn] = useState('todo');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newBucket, setNewBucket] = useState('General');
  const [newRecurrence, setNewRecurrence] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchTodos = useCallback(async () => {
    const res = await fetch('/api/todos');
    const data = await res.json();
    setTodos(data.todos ?? []);
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  const addTodo = async () => {
    if (!newTitle.trim()) return;
    await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle,
        description: newDesc || null,
        status: addToColumn,
        priority: newPriority,
        due_date: newDueDate || null,
        bucket: newBucket,
        recurrence: newRecurrence || null,
      }),
    });
    setNewTitle(''); setNewDesc(''); setNewPriority('medium'); setNewDueDate(''); setShowAdd(false);
    fetchTodos();
  };

  const updateTodo = async (id: string, updates: Partial<Todo>) => {
    await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    fetchTodos();
  };

  const deleteTodo = async (id: string) => {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const clearCompleted = async () => {
    const done = todos.filter(t => t.status === 'done');
    if (done.length === 0) return;
    if (!confirm(`Delete ${done.length} completed task${done.length > 1 ? 's' : ''}?`)) return;
    await Promise.all(done.map(t => fetch(`/api/todos/${t.id}`, { method: 'DELETE' })));
    toast.success(`Cleared ${done.length} completed tasks`);
    fetchTodos();
  };

  // ── Computed data ──

  const activeTodos = useMemo(() => todos.filter(t => t.status !== 'done'), [todos]);
  const completedTodos = useMemo(() => sortByPriorityAndDue(todos.filter(t => t.status === 'done')), [todos]);

  const stats = useMemo(() => {
    const today = getToday();
    return {
      overdue: activeTodos.filter(t => t.due_date && t.due_date < today).length,
      dueToday: activeTodos.filter(t => t.due_date === today).length,
      inProgress: activeTodos.filter(t => t.status === 'in-progress').length,
      completed: completedTodos.length,
      total: todos.length,
    };
  }, [activeTodos, completedTodos, todos]);

  // Group active todos by due-date section
  const groupedActive = useMemo(() => {
    const sorted = sortByPriorityAndDue(activeTodos);
    const groups: Record<DueGroup, Todo[]> = {
      overdue: [], today: [], 'this-week': [], later: [], 'no-date': [],
    };
    for (const t of sorted) {
      groups[getDueGroup(t)].push(t);
    }
    return groups;
  }, [activeTodos]);

  const formatDueDate = (d: string | null) => {
    if (!d) return null;
    const days = daysFromNow(d);
    if (days < 0) return { text: `${Math.abs(days)}d overdue`, className: 'text-red-400' };
    if (days === 0) return { text: 'Today', className: 'text-yellow-400' };
    if (days === 1) return { text: 'Tomorrow', className: 'text-yellow-400' };
    if (days <= 7) return { text: `${days}d`, className: 'text-muted-foreground' };
    const date = new Date(d);
    return { text: date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), className: 'text-muted-foreground' };
  };

  // ── Task Card (planner) ──
  const TaskCard = ({ todo }: { todo: Todo }) => {
    const due = formatDueDate(todo.due_date);
    const isOverdue = todo.due_date && daysFromNow(todo.due_date) < 0;
    return (
      <div className={cn(
        'bg-card border rounded-lg p-3 hover:border-border/60 transition-colors group',
        isOverdue ? 'border-red-500/30' : 'border-border',
      )}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-foreground text-sm font-medium">{todo.title}</p>
            {todo.description && (
              <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{todo.description}</p>
            )}
          </div>
          <button
            onClick={() => deleteTodo(todo.id)}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-red-400 text-xs transition-opacity"
          >
            x
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={cn('text-xs px-1.5 py-0.5 rounded border', PRIORITY_COLORS[todo.priority])}>
            {PRIORITY_LABELS[todo.priority]}
          </span>
          {todo.bucket !== 'General' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{todo.bucket}</span>
          )}
          {due && <span className={cn('text-xs', due.className)}>{due.text}</span>}
          <EntityLinks entityType="todo" entityId={todo.id} compact />
        </div>
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {[...STATUS_COLUMNS, { key: 'done', label: 'Done' }].filter(c => c.key !== todo.status).map((col) => (
            <button
              key={col.key}
              onClick={() => updateTodo(todo.id, { status: col.key })}
              className="text-xs px-2 py-0.5 rounded border border-border hover:border-white/15 text-muted-foreground hover:text-foreground transition-colors"
            >
              &rarr; {col.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ── Planner View (Kanban) — Done separated below ──
  const PlannerView = () => (
    <div className="space-y-4 overflow-auto pb-4">
      {/* Kanban columns (To Do + In Progress only) */}
      <div className="flex flex-col sm:flex-row gap-4 min-h-0">
        {STATUS_COLUMNS.map((col) => {
          const colTodos = sortByPriorityAndDue(todos.filter(t => t.status === col.key));
          return (
            <div key={col.key} className="flex-1 sm:min-w-[280px] flex flex-col min-h-0">
              <div className={cn('flex items-center justify-between px-3 py-2 rounded-t-lg border-t-2', col.color, col.bg)}>
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm font-semibold', col.text)}>{col.label}</span>
                  <span className="text-xs bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full">{colTodos.length}</span>
                </div>
                <button
                  onClick={() => { setAddToColumn(col.key); setShowAdd(true); }}
                  className="text-muted-foreground hover:text-foreground text-lg transition-colors"
                >
                  +
                </button>
              </div>
              <div className="flex-1 overflow-auto space-y-2 p-2 bg-background/30 rounded-b-lg border border-border border-t-0 min-h-[120px]">
                {colTodos.length === 0 ? (
                  <p className="text-muted-foreground/60 text-xs text-center py-4">No tasks</p>
                ) : (
                  colTodos.map((todo) => <TaskCard key={todo.id} todo={todo} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Completed section (collapsible) */}
      {completedTodos.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-green-500/5 hover:bg-green-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                className={`transition-transform text-green-400 ${showCompleted ? 'rotate-90' : ''}`}><path d="M9 18l6-6-6-6"/></svg>
              <span className="text-green-400 text-xs font-semibold uppercase tracking-wider">
                Completed ({completedTodos.length})
              </span>
            </div>
            {showCompleted && (
              <button
                onClick={(e) => { e.stopPropagation(); clearCompleted(); }}
                className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors px-2 py-0.5 rounded border border-border"
              >
                Clear all
              </button>
            )}
          </button>
          {showCompleted && (
            <div className="p-2 space-y-1.5 bg-background/30 max-h-[300px] overflow-auto">
              {completedTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg opacity-60 hover:opacity-80 transition-opacity group"
                >
                  <button
                    onClick={() => updateTodo(todo.id, { status: 'todo' })}
                    className="w-4 h-4 rounded border-2 bg-green-500 border-green-500 flex items-center justify-center shrink-0 hover:bg-green-400 transition-colors"
                    title="Undo complete"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>
                  </button>
                  <span className="text-muted-foreground text-sm line-through truncate flex-1">{todo.title}</span>
                  {todo.bucket !== 'General' && (
                    <span className="text-[10px] text-muted-foreground/50">{todo.bucket}</span>
                  )}
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="text-muted-foreground/40 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Table Row ──
  const TableRow = ({ todo }: { todo: Todo; }) => {
    const due = formatDueDate(todo.due_date);
    const isOverdue = todo.due_date && daysFromNow(todo.due_date) < 0;
    return (
      <React.Fragment>
        <tr
          className={cn(
            'hover:bg-secondary/50 cursor-pointer transition-colors',
            isOverdue && 'bg-red-500/[0.03]',
          )}
          onClick={() => setExpandedId(expandedId === todo.id ? null : todo.id)}
        >
          <td className="px-5 py-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTodo(todo.id, { status: todo.status === 'done' ? 'todo' : 'done' });
              }}
              className={cn(
                'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                todo.status === 'done' ? 'bg-green-500 border-green-500' : 'border-border hover:border-white/15'
              )}
            >
              {todo.status === 'done' && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>
              )}
            </button>
          </td>
          <td className={cn('px-5 py-3 text-sm font-medium', todo.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground')}>
            {todo.title}
          </td>
          <td className="px-5 py-3">
            <span className={cn('text-xs px-2 py-0.5 rounded border', PRIORITY_COLORS[todo.priority])}>
              {PRIORITY_LABELS[todo.priority]}
            </span>
          </td>
          <td className="px-5 py-3">
            <select
              value={todo.status}
              onChange={(e) => { e.stopPropagation(); updateTodo(todo.id, { status: e.target.value }); }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent text-muted-foreground text-xs border border-border rounded px-1.5 py-1 focus:outline-none"
            >
              {ALL_STATUSES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </td>
          <td className="px-5 py-3 text-muted-foreground text-xs">{todo.bucket}</td>
          <td className="px-5 py-3">
            {due && <span className={cn('text-xs', due.className)}>{due.text}</span>}
          </td>
          <td className="px-3 py-3">
            <button
              onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id); }}
              className="text-muted-foreground/60 hover:text-red-400 text-sm transition-colors"
            >
              x
            </button>
          </td>
        </tr>
        {expandedId === todo.id && (
          <tr>
            <td colSpan={7} className="px-5 py-3 bg-background/50">
              {todo.description && (
                <p className="text-foreground text-sm whitespace-pre-wrap">{todo.description}</p>
              )}
              <EntityLinks entityType="todo" entityId={todo.id} />
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  // ── Table View (with smart due-date grouping) ──
  const TableView = () => {
    const groupOrder: DueGroup[] = ['overdue', 'today', 'this-week', 'later', 'no-date'];
    const nonEmptyGroups = groupOrder.filter(g => groupedActive[g].length > 0);

    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-8">
                <span className="sr-only">Check</span>
              </th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3">Task</th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-24">Priority</th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-28">Status</th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-24">Bucket</th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-24">Due</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {nonEmptyGroups.map((group) => {
              const config = DUE_GROUP_CONFIG[group];
              const groupTodos = groupedActive[group];
              return (
                <React.Fragment key={group}>
                  {/* Group header */}
                  {nonEmptyGroups.length > 1 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-1.5 bg-background/60">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[10px] font-bold uppercase tracking-widest', config.color)}>
                            {config.icon} {config.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground/40">{groupTodos.length}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {groupTodos.map((todo) => (
                    <TableRow key={todo.id} todo={todo} />
                  ))}
                </React.Fragment>
              );
            })}

            {/* Completed divider */}
            {completedTodos.length > 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-2 bg-background/70">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-colors flex items-center gap-1.5"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                        className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`}><path d="M9 18l6-6-6-6"/></svg>
                      Completed ({completedTodos.length})
                    </button>
                    {showCompleted && (
                      <button
                        onClick={clearCompleted}
                        className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {showCompleted && completedTodos.map((todo) => {
              const due = formatDueDate(todo.due_date);
              return (
                <tr key={todo.id} className="hover:bg-secondary/30 opacity-60">
                  <td className="px-5 py-3">
                    <button
                      onClick={() => updateTodo(todo.id, { status: 'todo' })}
                      className="w-5 h-5 rounded border-2 bg-green-500 border-green-500 flex items-center justify-center transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>
                    </button>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-sm line-through">{todo.title}</td>
                  <td className="px-5 py-3"><span className={cn('text-xs px-2 py-0.5 rounded border', PRIORITY_COLORS[todo.priority])}>{PRIORITY_LABELS[todo.priority]}</span></td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">Done</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{todo.bucket}</td>
                  <td className="px-5 py-3">{due && <span className={cn('text-xs', due.className)}>{due.text}</span>}</td>
                  <td className="px-3 py-3"><button onClick={() => deleteTodo(todo.id)} className="text-muted-foreground/60 hover:text-red-400 text-sm">x</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4 h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-foreground">To-Do</h2>
          <p className="text-muted-foreground text-sm mt-1">Plan and track your tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-card border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('planner')}
              className={cn(
                'px-3 py-1.5 text-sm transition-colors',
                viewMode === 'planner' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Planner view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'px-3 py-1.5 text-sm transition-colors',
                viewMode === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Table view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18"/></svg>
            </button>
          </div>
          <button
            onClick={() => { setAddToColumn('todo'); setShowAdd(!showAdd); }}
            className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Task'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        {stats.overdue > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-xs font-semibold">{stats.overdue} overdue</span>
          </div>
        )}
        {stats.dueToday > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            <span className="text-yellow-400 text-xs font-semibold">{stats.dueToday} due today</span>
          </div>
        )}
        {stats.inProgress > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/5 border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span className="text-muted-foreground text-xs">{stats.inProgress} in progress</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/5 border border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-muted-foreground text-xs">{stats.completed} done</span>
        </div>
        <span className="text-muted-foreground/40 text-[10px] ml-auto">{stats.total} total</span>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-full">
              <label className="text-foreground text-sm block mb-1">Title</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                autoFocus
              />
            </div>
            <div className="col-span-full">
              <label className="text-foreground text-sm block mb-1">Description</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                placeholder="Optional details..."
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Due Date</label>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Bucket</label>
              <input
                value={newBucket}
                onChange={(e) => setNewBucket(e.target.value)}
                placeholder="General"
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Repeat</label>
              <select
                value={newRecurrence}
                onChange={(e) => setNewRecurrence(e.target.value)}
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2"
              >
                <option value="">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={addTodo}
                disabled={!newTitle.trim()}
                className="bg-primary text-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {todos.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">No tasks yet. Click &quot;+ Add Task&quot; to get started.</p>
          </div>
        ) : viewMode === 'planner' ? (
          <PlannerView />
        ) : (
          <TableView />
        )}
      </div>
    </div>
  );
}
