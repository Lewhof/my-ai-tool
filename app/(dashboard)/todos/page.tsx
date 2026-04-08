'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';
import { toast } from 'sonner';

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
  { key: 'done', label: 'Done', color: 'border-green-500', bg: 'bg-green-500/10', text: 'text-green-400' },
];

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

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [viewMode, setViewMode] = useState<'planner' | 'table'>('planner');
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

  const buckets = [...new Set(todos.map((t) => t.bucket))].sort();

  const formatDueDate = (d: string | null) => {
    if (!d) return null;
    const date = new Date(d);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / 86400000);
    if (days < 0) return { text: `${Math.abs(days)}d overdue`, className: 'text-red-400' };
    if (days === 0) return { text: 'Today', className: 'text-yellow-400' };
    if (days === 1) return { text: 'Tomorrow', className: 'text-yellow-400' };
    if (days <= 7) return { text: `${days}d`, className: 'text-muted-foreground' };
    return { text: date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), className: 'text-muted-foreground' };
  };

  // ── Task Card (used in planner) ──
  const TaskCard = ({ todo }: { todo: Todo }) => {
    const due = formatDueDate(todo.due_date);
    return (
      <div className="bg-card border border-border rounded-lg p-3 hover:border-border transition-colors group">
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
        </div>
        {/* Quick status move */}
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {STATUS_COLUMNS.filter((c) => c.key !== todo.status).map((col) => (
            <button
              key={col.key}
              onClick={() => updateTodo(todo.id, { status: col.key })}
              className={cn('text-xs px-2 py-0.5 rounded border border-border hover:border-white/15 text-muted-foreground hover:text-foreground transition-colors')}
            >
              &rarr; {col.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ── Planner View (Kanban) ──
  const PlannerView = () => (
    <div className="flex flex-col sm:flex-row gap-4 h-full min-h-0 overflow-y-auto sm:overflow-x-auto pb-4">
      {STATUS_COLUMNS.map((col) => {
        const colTodos = todos.filter((t) => t.status === col.key);
        return (
          <div key={col.key} className="flex-1 sm:min-w-[240px] flex flex-col min-h-0">
            {/* Column header */}
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
            {/* Cards */}
            <div className="flex-1 overflow-auto space-y-2 p-2 bg-background/30 rounded-b-lg border border-border border-t-0">
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
  );

  // ── Table View ──
  const TableView = () => (
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
          {todos.filter((t) => t.status !== 'done').map((todo) => {
            const due = formatDueDate(todo.due_date);
            return (
              <React.Fragment key={todo.id}>
                <tr
                  key={todo.id}
                  className="hover:bg-secondary/50 cursor-pointer transition-colors"
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
                      {STATUS_COLUMNS.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
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
                {expandedId === todo.id && todo.description && (
                  <tr key={`${todo.id}-desc`}>
                    <td colSpan={7} className="px-5 py-3 bg-background/50">
                      <p className="text-foreground text-sm whitespace-pre-wrap">{todo.description}</p>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {/* Completed divider — collapsible */}
          {todos.filter((t) => t.status === 'done').length > 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-2 bg-background/70">
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-colors flex items-center gap-1.5"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`}><path d="M9 18l6-6-6-6"/></svg>
                  Completed ({todos.filter((t) => t.status === 'done').length})
                </button>
              </td>
            </tr>
          )}
          {showCompleted && todos.filter((t) => t.status === 'done').map((todo) => {
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

  return (
    <div className="p-6 space-y-6 h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-foreground">To-Do</h2>
          <p className="text-muted-foreground text-sm mt-1">Plan and track your tasks</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
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
            className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Task'}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4 shrink-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-foreground text-sm block mb-1">Title</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
              />
            </div>
            <div className="col-span-2">
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
                className="bg-primary text-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary transition-colors disabled:opacity-50"
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {todos.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">No tasks yet. Click "+ Add Task" to get started.</p>
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
