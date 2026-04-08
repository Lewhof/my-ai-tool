'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Flame, Plus, Trash2, Check, Loader2 } from 'lucide-react';

interface Habit {
  id: string;
  name: string;
  frequency: string;
  current_streak: number;
  best_streak: number;
  completedToday: boolean;
}

interface HabitTrackerProps {
  compact?: boolean; // dashboard widget mode
}

export default function HabitTracker({ compact = false }: HabitTrackerProps) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchHabits = useCallback(async () => {
    try {
      const res = await fetch('/api/habits');
      if (res.ok) {
        const data = await res.json();
        setHabits(data.habits ?? []);
      }
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  const addHabit = async () => {
    if (!newName.trim()) return;
    const res = await fetch('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      toast.success('Habit added');
      setNewName('');
      setShowAdd(false);
      fetchHabits();
    }
  };

  const toggleHabit = async (id: string) => {
    setToggling(id);
    const res = await fetch('/api/habits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'toggle' }),
    });
    if (res.ok) {
      const data = await res.json();
      setHabits(prev => prev.map(h =>
        h.id === id ? {
          ...h,
          completedToday: data.completed,
          current_streak: data.completed ? h.current_streak + 1 : Math.max(0, h.current_streak - 1),
        } : h
      ));
    }
    setToggling(null);
  };

  const deleteHabit = async (id: string) => {
    await fetch(`/api/habits?id=${id}`, { method: 'DELETE' });
    setHabits(prev => prev.filter(h => h.id !== id));
  };

  const completedCount = habits.filter(h => h.completedToday).length;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading habits...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="widget-handle px-4 py-3 border-b border-border flex items-center justify-between cursor-move">
        <div className="flex items-center gap-2">
          <Flame size={16} className="text-orange-400" />
          <h3 className="text-foreground font-semibold text-sm">Habits</h3>
          {habits.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
              {completedCount}/{habits.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Add habit form */}
        {showAdd && (
          <div className="px-4 py-2 border-b border-border flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addHabit(); }}
              placeholder="New habit..."
              className="flex-1 bg-secondary text-foreground border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
            <button onClick={addHabit} className="text-xs px-2 py-1 bg-primary text-foreground rounded hover:bg-primary/90">Add</button>
          </div>
        )}

        {/* Habit list */}
        {habits.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-muted-foreground/60 text-xs">No habits yet</p>
            <button onClick={() => setShowAdd(true)} className="text-primary text-xs mt-1 hover:text-primary/80">Add your first habit</button>
          </div>
        ) : (
          <div className={cn('divide-y divide-border', compact && 'max-h-[200px]')}>
            {habits.map((habit) => (
              <div key={habit.id} className="flex items-center gap-3 px-4 py-2.5 group hover:bg-secondary/30 transition-colors">
                {/* Toggle button */}
                <button
                  onClick={() => toggleHabit(habit.id)}
                  disabled={toggling === habit.id}
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    habit.completedToday
                      ? 'bg-green-500 border-green-500'
                      : 'border-border hover:border-primary'
                  )}
                >
                  {toggling === habit.id ? (
                    <Loader2 size={10} className="animate-spin text-white" />
                  ) : habit.completedToday ? (
                    <Check size={10} className="text-white" />
                  ) : null}
                </button>

                {/* Name + streak */}
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', habit.completedToday ? 'text-muted-foreground line-through' : 'text-foreground')}>{habit.name}</p>
                </div>

                {/* Streak */}
                {habit.current_streak > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Flame size={10} className={cn(habit.current_streak >= 7 ? 'text-orange-400' : 'text-muted-foreground')} />
                    <span className={cn('text-[10px] font-medium', habit.current_streak >= 7 ? 'text-orange-400' : 'text-muted-foreground')}>
                      {habit.current_streak}
                    </span>
                  </div>
                )}

                {/* Delete */}
                {!compact && (
                  <button
                    onClick={() => deleteHabit(habit.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-red-400 p-0.5 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
