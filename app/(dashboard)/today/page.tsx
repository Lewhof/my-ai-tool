'use client';

import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles, AlertTriangle, ArrowRight, CheckCircle2, FileText, BookOpen, Activity,
  RefreshCw, Loader2, Zap, Brain, Calendar, Clock,
} from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { DashboardSurface, HeroGradient, StatTile, EmptyState, CardRowSkeleton, StatTileSkeleton } from '@/components/surface';

interface TodayData {
  briefing: { content: string; cached: boolean } | null;
  next_action: {
    id: string;
    title: string;
    reason: 'overdue' | 'due_today' | 'urgent' | 'next_in_priority';
    priority: string;
    due_date: string | null;
  } | null;
  changes: Array<{
    kind: 'todo_done' | 'note_created' | 'kb_created' | 'metric_logged' | 'workout_done';
    title: string;
    at: string;
    href?: string;
  }>;
  stats: {
    todos_due_today: number;
    todos_overdue: number;
    todos_done_today: number;
    calendar_events_today: number;
  };
}

const REASON_LABEL: Record<NonNullable<TodayData['next_action']>['reason'], string> = {
  overdue: 'Overdue — clear this first',
  due_today: 'Due today',
  urgent: 'Highest priority',
  next_in_priority: 'Next up',
};

const CHANGE_ICONS: Record<TodayData['changes'][number]['kind'], React.ComponentType<{ size?: number; className?: string }>> = {
  todo_done: CheckCircle2,
  note_created: FileText,
  kb_created: BookOpen,
  metric_logged: Activity,
  workout_done: Zap,
};

const CHANGE_LABELS: Record<TodayData['changes'][number]['kind'], string> = {
  todo_done: 'completed',
  note_created: 'note',
  kb_created: 'KB entry',
  metric_logged: 'logged',
  workout_done: 'workout',
};

export default function TodayPage() {
  const { data, isLoading, error, mutate } = useSWR<TodayData>('/api/today');
  const [refreshingBriefing, setRefreshingBriefing] = useState(false);

  const refreshBriefing = async () => {
    setRefreshingBriefing(true);
    try {
      // Hit the briefing endpoint — it regenerates if no cache for today
      await fetch('/api/dashboard/briefing');
      await mutate();
      toast.success('Briefing refreshed');
    } catch {
      toast.error('Could not refresh briefing');
    } finally {
      setRefreshingBriefing(false);
    }
  };

  const greeting = getGreeting();
  const dateStr = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Africa/Johannesburg',
  });

  return (
    <DashboardSurface
      title="Today"
      subtitle={dateStr}
      brandIcon={<Brain />}
      hero={
        <HeroGradient eyebrow={greeting} title="Your second brain" subtitle="What changed, what's next, what to focus on.">
          {data?.briefing && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 status-dot-green" />
              Briefing ready · cached for the day
            </div>
          )}
        </HeroGradient>
      }
    >
      <div className="space-y-8 pb-12">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading || !data ? (
            <>
              <StatTileSkeleton /><StatTileSkeleton /><StatTileSkeleton /><StatTileSkeleton />
            </>
          ) : (
            <>
              <StatTile
                tone="flame"
                icon={<AlertTriangle size={18} />}
                label="Overdue"
                value={String(data.stats.todos_overdue)}
                unit={data.stats.todos_overdue === 1 ? 'task' : 'tasks'}
                accent={data.stats.todos_overdue > 0}
              />
              <StatTile
                tone="time"
                icon={<Calendar size={18} />}
                label="Due today"
                value={String(data.stats.todos_due_today)}
                unit={data.stats.todos_due_today === 1 ? 'task' : 'tasks'}
              />
              <StatTile
                tone="growth"
                icon={<CheckCircle2 size={18} />}
                label="Done today"
                value={String(data.stats.todos_done_today)}
                unit={data.stats.todos_done_today === 1 ? 'task' : 'tasks'}
                accent={data.stats.todos_done_today >= 3}
              />
              <StatTile
                tone="brand"
                icon={<Sparkles size={18} />}
                label="What changed"
                value={String(data.changes.length)}
                unit={data.changes.length === 1 ? 'event' : 'events'}
              />
            </>
          )}
        </div>

        {/* Two-column: Briefing + Next Action */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Briefing — spans 2 cols */}
          <section className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-foreground font-bold text-lg flex items-center gap-2">
                <Sparkles size={18} className="text-primary" /> Briefing
              </h2>
              <button
                onClick={refreshBriefing}
                disabled={refreshingBriefing}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
                title="Regenerate briefing"
              >
                {refreshingBriefing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 min-h-[200px]">
              {isLoading || !data ? (
                <div className="space-y-2">
                  <div className="h-4 bg-secondary/50 rounded w-3/4 animate-pulse" />
                  <div className="h-4 bg-secondary/50 rounded w-full animate-pulse" />
                  <div className="h-4 bg-secondary/50 rounded w-5/6 animate-pulse" />
                </div>
              ) : data.briefing?.content ? (
                <div className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-li:text-foreground/90">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.briefing.content}</ReactMarkdown>
                </div>
              ) : (
                <EmptyState
                  icon={<Sparkles />}
                  title="No briefing yet today"
                  description="Generate one to get a one-screen view of today: weather, calendar, top tasks, and an AI-flagged focus area."
                  action={{ label: refreshingBriefing ? 'Generating…' : 'Generate briefing', onClick: refreshBriefing }}
                />
              )}
            </div>
          </section>

          {/* Next action — 1 col */}
          <section>
            <h2 className="text-foreground font-bold text-lg flex items-center gap-2 mb-3">
              <ArrowRight size={18} className="text-primary" /> Next action
            </h2>
            {isLoading || !data ? (
              <CardRowSkeleton />
            ) : data.next_action ? (
              <Link
                href="/todos"
                className="block bg-card hover:bg-card/80 border border-border hover:border-primary/40 rounded-2xl p-5 transition-all group"
              >
                <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">{REASON_LABEL[data.next_action.reason]}</p>
                <h3 className="text-foreground font-bold text-lg mt-1.5 line-clamp-3">{data.next_action.title}</h3>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="capitalize">{data.next_action.priority}</span>
                  {data.next_action.due_date && (
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {formatDue(data.next_action.due_date)}
                    </span>
                  )}
                </div>
                <div className="mt-4 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  Open in tasks <ArrowRight size={12} />
                </div>
              </Link>
            ) : (
              <EmptyState
                icon={<CheckCircle2 />}
                title="Inbox zero"
                description="No overdue, no due-today, no urgent. You're ahead — pick something from the backlog or rest."
                action={{ label: 'Open tasks', href: '/todos' }}
              />
            )}
          </section>
        </div>

        {/* What changed timeline */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-foreground font-bold text-lg">What changed today</h2>
            <span className="text-muted-foreground text-xs">last {data?.changes.length ?? 0} events</span>
          </div>
          {isLoading || !data ? (
            <div className="space-y-2">
              <CardRowSkeleton /><CardRowSkeleton /><CardRowSkeleton />
            </div>
          ) : data.changes.length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title="Nothing recorded yet"
              description="Complete a task, save a note, log a metric — anything that moves your day forward shows up here."
            />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="divide-y divide-border">
                {data.changes.map((c, i) => {
                  const Icon = CHANGE_ICONS[c.kind];
                  const inner = (
                    <div className="px-4 py-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon size={14} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-sm truncate">{c.title}</p>
                        <p className="text-muted-foreground text-[11px]">
                          {CHANGE_LABELS[c.kind]} · {timeAgo(c.at)}
                        </p>
                      </div>
                    </div>
                  );
                  return c.href
                    ? <Link key={`${c.at}-${i}`} href={c.href} className="block">{inner}</Link>
                    : <div key={`${c.at}-${i}`}>{inner}</div>;
                })}
              </div>
            </div>
          )}
        </section>

        {error && (
          <div className="text-center text-red-400 text-sm">
            Could not load today’s data. <button onClick={() => mutate()} className="underline hover:no-underline">Retry</button>
          </div>
        )}
      </div>
    </DashboardSurface>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning, Lew';
  if (h < 17) return 'Good afternoon, Lew';
  return 'Good evening, Lew';
}

function formatDue(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return `Overdue · ${date}`;
  if (date === today) return 'Today';
  const d = new Date(date);
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}
