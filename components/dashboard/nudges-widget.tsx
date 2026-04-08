'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Bell, AlertTriangle, Clock, Layout, Users, Flame,
  X, AlarmClock, Loader2,
} from 'lucide-react';

interface Nudge {
  id: string;
  type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  overdue_task: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
  approaching_deadline: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  stale_whiteboard: { icon: Layout, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  contact_dormant: { icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  habit_broken: { icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/10' },
};

export default function NudgesWidget() {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/nudges')
      .then(r => r.json())
      .then(d => setNudges(d.nudges ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAction = async (id: string, action: 'dismiss' | 'snooze') => {
    await fetch('/api/nudges', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    setNudges(prev => prev.filter(n => n.id !== id));
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading nudges...
        </div>
      </div>
    );
  }

  if (nudges.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Bell size={14} className="text-primary" />
        <h3 className="text-foreground font-semibold text-sm">Nudges</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">{nudges.length}</span>
      </div>
      <div className="divide-y divide-border max-h-[300px] overflow-auto">
        {nudges.map((nudge) => {
          const config = TYPE_CONFIG[nudge.type] || TYPE_CONFIG.overdue_task;
          const Icon = config.icon;
          return (
            <div key={nudge.id} className="px-4 py-3 flex items-start gap-3 group hover:bg-secondary/30 transition-colors">
              <div className={cn('p-1.5 rounded-lg shrink-0 mt-0.5', config.bg)}>
                <Icon size={12} className={config.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-xs font-medium">{nudge.title}</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">{nudge.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleAction(nudge.id, 'snooze')}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Snooze 24h"
                >
                  <AlarmClock size={12} />
                </button>
                <button
                  onClick={() => handleAction(nudge.id, 'dismiss')}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors"
                  title="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
