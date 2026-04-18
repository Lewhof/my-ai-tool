'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bot, MessageSquare, FileText, Zap, CheckSquare,
  ChevronRight, TrendingUp, Cpu, Database,
  ArrowUpRight, Plus, Mic, MicOff,
  StickyNote, Save, Pin, Calendar, BookOpen,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeDate, truncate } from '@/lib/utils';
import { toast } from 'sonner';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import WeatherWidget from '@/components/dashboard/weather-widget';
import CalendarWidget from '@/components/dashboard/calendar-widget';
import BriefingWidget from '@/components/dashboard/briefing-widget';
import HealthWidget from '@/components/dashboard/health-widget';
import HabitTracker from '@/components/habit-tracker';
import NudgesWidget from '@/components/dashboard/nudges-widget';
import MindWidget from '@/components/dashboard/mind-widget';
import NewsWidget from '@/components/dashboard/news-widget';
import UfcWidget from '@/components/dashboard/ufc-widget';

interface DashboardData {
  recentChats: Array<{ id: string; title: string; updated_at: string }>;
  recentDocs: Array<{ id: string; name: string; file_type: string; created_at: string }>;
  recentRuns: Array<{ id: string; input: string; status: string; created_at: string }>;
  pendingTodos: Array<{ id: string; title: string; status: string; priority: string; due_date: string | null }>;
}

interface CreditsData {
  ai?: {
    totalCost: number;
    totalRequests: number;
    totalTokens: number;
    models: Record<string, { cost: number; requests: number }>;
    period: string;
    error?: string;
  };
  vercel?: { status?: string; error?: string };
  supabase?: { status: string; tier: string };
  clerk?: { status: string; tier: string };
  anthropicBalance?: {
    configured: boolean;
    remaining?: number;
    alertThreshold?: number;
    lowBalance?: boolean;
  };
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

const NOTEPAD_KEY = 'lewhof-notepad';

function NotePad() {
  const [content, setContent] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Load from API
    fetch('/api/notes').then(r => r.json()).then(d => {
      setContent(d?.content ?? localStorage.getItem(NOTEPAD_KEY) ?? '');
      setNoteId(d?.id ?? null);
    }).catch(() => {
      setContent(localStorage.getItem(NOTEPAD_KEY) ?? '');
    });
  }, []);

  const handleChange = (val: string) => {
    setContent(val);
    setSaved(false);
    localStorage.setItem(NOTEPAD_KEY, val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch('/api/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: noteId, content: val }),
      });
      setSaved(true);
    }, 1000);
  };

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return (
    <div className="rounded-2xl border border-border overflow-hidden animate-fade-up animate-fade-up-delay-4"
      style={{ background: 'var(--color-surface-1)' }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <StickyNote size={15} style={{ color: 'var(--color-brand)' }} />
          <h3 className="text-[13px] font-semibold text-foreground">Notepad</h3>
          <Pin size={11} className="text-muted-foreground" />
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            'text-[10px] font-medium transition-colors',
            saved ? 'text-emerald-400' : 'text-muted-foreground'
          )}>
            {saved ? '\u25CF Saved' : '\u25CF Unsaved'}
          </span>
          <button
            onClick={async () => {
              if (!content.trim()) { toast('Nothing to save'); return; }
              const title = content.split('\n')[0].slice(0, 50) || 'Dashboard Note';
              await fetch('/api/notes-v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content }),
              });
              toast('Saved as note');
            }}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            title="Save as a permanent note"
          >
            <BookOpen size={12} /> Note
          </button>
          <button
            onClick={() => {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              localStorage.setItem(NOTEPAD_KEY, content);
              fetch('/api/notes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: noteId, content }),
              });
              setSaved(true);
              toast('Notepad saved');
            }}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Save size={12} /> Save
          </button>
        </div>
      </div>
      <div className="p-4">
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={'You are my strategic partner...\n\nUse this space for your daily prompts, goals, or anything you want Cerebro to know about you.'}
          className="w-full resize-none text-[13px] text-foreground placeholder-muted-foreground/40 bg-transparent outline-none leading-relaxed"
          rows={8}
          style={{ fontFamily: 'var(--font-body)' }}
        />
      </div>
      <div className="px-5 py-3 border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {content.length} chars
        </span>
        <button
          onClick={() => {
            setContent('');
            localStorage.removeItem(NOTEPAD_KEY);
            fetch('/api/notes', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: noteId, content: '' }),
            });
            setSaved(true);
            toast('Notepad cleared');
          }}
          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: 'New Chat', icon: MessageSquare, href: '/chat', color: 'var(--color-brand)' },
  { label: 'Upload Doc', icon: FileText, href: '/documents', color: 'oklch(0.60 0.20 255)' },
  { label: 'Run Workflow', icon: Zap, href: '/workflows', color: 'oklch(0.55 0.18 160)' },
  { label: 'Add Task', icon: CheckSquare, href: '/todos', color: 'oklch(0.65 0.16 290)' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { data: dashData } = useSWR<DashboardData>('/api/dashboard');
  const { data: creditsData } = useSWR<CreditsData>('/api/dashboard/credits');
  const data = dashData ?? null;
  const credits = creditsData ?? null;
  const [cerebroInput, setCerebroInput] = useState('');

  const { isSupported: speechSupported, isListening, transcript, startListening, stopListening, resetTranscript } =
    useSpeechRecognition({
      onFinalTranscript: (text) => setCerebroInput(text),
      onError: (err) => toast.error(`Mic error: ${err}`),
    });

  useEffect(() => {
    if (isListening && transcript) {
      setCerebroInput(transcript);
    }
  }, [isListening, transcript]);

  const handleMicClick = () => {
    if (!speechSupported) {
      toast.error('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      setCerebroInput('');
      startListening();
      toast('Listening...', { description: 'Speak now \u2014 tap mic again to stop' });
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-up">
      {/* Low Anthropic Balance Warning */}
      {credits?.anthropicBalance?.configured && credits.anthropicBalance.lowBalance && (
        <Link
          href="/credits"
          className="flex items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/5 px-5 py-3 hover:bg-red-500/10 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-500/20 text-red-400 shrink-0">
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-red-400">Anthropic credit running low</p>
            <p className="text-[11px] text-muted-foreground">
              {formatCost(credits.anthropicBalance.remaining ?? 0)} remaining
              {credits.anthropicBalance.alertThreshold !== undefined &&
                ` · below ${formatCost(credits.anthropicBalance.alertThreshold)} threshold`}
              {' · '}Top up at console.anthropic.com
            </p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        </Link>
      )}

      {/* Cerebro Hero Card */}
      <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: 160 }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, oklch(0.10 0.012 255 / 0.92) 0%, oklch(0.10 0.012 255 / 0.75) 100%)' }} />
        <div className="relative p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center cerebro-pulse" style={{ background: 'var(--color-brand)' }}>
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Cerebro</p>
              <p className="text-[13px] font-medium text-white/80">Claude Sonnet &middot; All tools active</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full status-dot-green" />
              <span className="text-[11px] text-white/50">Online</span>
            </div>
          </div>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (isListening) stopListening();
            if (cerebroInput.trim()) {
              router.push(`/cerebro?prompt=${encodeURIComponent(cerebroInput)}`);
            }
          }} className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                value={cerebroInput}
                onChange={(e) => setCerebroInput(e.target.value)}
                placeholder="Ask anything \u2014 voice, camera, or type..."
                className="w-full px-4 py-3 rounded-xl text-[14px] text-white placeholder-white/30 outline-none border border-white/10 focus:border-white/20 transition-colors"
                style={{ background: 'oklch(1 0 0 / 0.07)', backdropFilter: 'blur(8px)' }}
              />
            </div>
            <button
              type="button"
              onClick={handleMicClick}
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center border transition-all duration-200',
                isListening
                  ? 'border-red-400/60 text-red-400 animate-pulse'
                  : 'border-white/10 text-white/50 hover:text-white'
              )}
              style={{ background: isListening ? 'oklch(0.62 0.22 25 / 0.18)' : 'oklch(1 0 0 / 0.07)' }}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <Link href="/cerebro">
              <button
                type="button"
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white transition-all btn-brand"
                style={{ background: 'var(--color-brand)' }}
              >
                <ArrowUpRight size={18} />
              </button>
            </Link>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {["What's on my calendar?", 'Show pending tasks', 'Weather today?'].map((s) => (
              <button
                key={s}
                onClick={() => setCerebroInput(s)}
                className="px-3 py-1 rounded-full text-[11px] text-white/60 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
                style={{ background: 'oklch(1 0 0 / 0.06)' }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Weather + Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border overflow-hidden animate-fade-up animate-fade-up-delay-1"
          style={{ background: 'var(--color-surface-1)' }}>
          <WeatherWidget />
        </div>
        <div className="sm:col-span-2 grid grid-cols-2 gap-3 animate-fade-up animate-fade-up-delay-1">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-3 p-4 rounded-2xl border border-border hover:border-white/15 transition-all duration-150 text-left group"
                style={{ background: 'var(--color-surface-1)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                  style={{ background: `color-mix(in oklch, ${action.color} 20%, transparent)` }}
                >
                  <Icon size={18} style={{ color: action.color }} />
                </div>
                <span className="text-[13px] font-medium text-foreground">{action.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Row 3: AI Briefing (full width) */}
      <div className="rounded-2xl border border-border overflow-hidden animate-fade-up animate-fade-up-delay-2"
        style={{ background: 'var(--color-surface-1)' }}>
        <BriefingWidget />
      </div>

      {/* Row 3.5: Nudges + Mind */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up animate-fade-up-delay-3">
        <NudgesWidget />
        <MindWidget />
      </div>

      {/* Row 3.6: News */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NewsWidget />
      </div>

      {/* Row 4: Tasks + Recent Chats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Tasks */}
        <div className="rounded-2xl border border-border overflow-hidden animate-fade-up animate-fade-up-delay-3"
          style={{ background: 'var(--color-surface-1)' }}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2">
              <CheckSquare size={15} style={{ color: 'oklch(0.55 0.18 160)' }} />
              <h3 className="text-[13px] font-semibold text-foreground">Pending Tasks</h3>
            </div>
            <Link href="/todos" className="text-[11px] font-medium transition-colors" style={{ color: 'var(--color-brand)' }}>
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {!data || data.pendingTodos.length === 0 ? (
              <p className="text-[13px] text-muted-foreground p-5">No pending tasks</p>
            ) : (
              data.pendingTodos.slice(0, 5).map((todo) => (
                <Link key={todo.id} href="/todos" className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors">
                  <div className="w-4 h-4 rounded border border-border shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-foreground truncate">{todo.title}</p>
                  </div>
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={
                      todo.priority === 'urgent' || todo.priority === 'high'
                        ? { background: 'oklch(0.62 0.22 25 / 0.15)', color: 'oklch(0.62 0.22 25)' }
                        : { background: 'var(--color-surface-2)', color: 'var(--color-muted-foreground)' }
                    }
                  >
                    {todo.priority}
                  </span>
                </Link>
              ))
            )}
          </div>
          <div className="px-5 py-3 border-t border-border">
            <Link href="/todos" className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Plus size={13} /> Add task
            </Link>
          </div>
        </div>

        {/* Recent Chats */}
        <div className="rounded-2xl border border-border overflow-hidden animate-fade-up animate-fade-up-delay-3"
          style={{ background: 'var(--color-surface-1)' }}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} style={{ color: 'oklch(0.65 0.16 290)' }} />
              <h3 className="text-[13px] font-semibold text-foreground">Recent Chats</h3>
            </div>
            <Link href="/chat" className="text-[11px] font-medium transition-colors" style={{ color: 'var(--color-brand)' }}>
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {!data || data.recentChats.length === 0 ? (
              <p className="text-[13px] text-muted-foreground p-5">No chats yet</p>
            ) : (
              data.recentChats.slice(0, 4).map((chat) => (
                <Link
                  key={chat.id}
                  href={`/chat/${chat.id}`}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-2 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'var(--color-brand-dim)' }}>
                      <MessageSquare size={13} style={{ color: 'var(--color-brand)' }} />
                    </div>
                    <span className="text-[13px] text-foreground truncate">{chat.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] text-muted-foreground">{formatRelativeDate(chat.updated_at)}</span>
                    <ChevronRight size={12} className="text-muted-foreground" />
                  </div>
                </Link>
              ))
            )}
          </div>
          <div className="px-5 py-3 border-t border-border">
            <Link href="/chat" className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Plus size={13} /> New chat
            </Link>
          </div>
        </div>
      </div>

      {/* Row 5: Notepad + Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NotePad />
        <div className="rounded-2xl border border-border overflow-hidden animate-fade-up animate-fade-up-delay-4"
          style={{ background: 'var(--color-surface-1)' }}>
          <CalendarWidget />
        </div>
      </div>

      {/* Row 6: Habits + Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up animate-fade-up-delay-5">
        <HabitTracker compact />
        <div className="rounded-2xl border border-border overflow-hidden"
          style={{ background: 'var(--color-surface-1)' }}>
          <HealthWidget />
        </div>
      </div>

      {/* Row 7: AI Usage */}
      <div className="rounded-2xl border border-border overflow-hidden animate-fade-up animate-fade-up-delay-5"
        style={{ background: 'var(--color-surface-1)' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} style={{ color: 'oklch(0.60 0.20 255)' }} />
            <h3 className="text-[13px] font-semibold text-foreground">AI Usage</h3>
          </div>
          <span className="text-[10px] text-muted-foreground">30 days</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Spend', value: credits?.ai?.totalCost !== undefined ? formatCost(credits.ai.totalCost) : null },
              { label: 'Requests', value: credits?.ai?.totalRequests?.toString() ?? null },
              { label: 'Tokens', value: credits?.ai?.totalTokens !== undefined ? formatTokens(credits.ai.totalTokens) : null },
              { label: 'Avg/Req', value: credits?.ai?.totalRequests ? formatCost(credits.ai.totalCost / credits.ai.totalRequests) : null },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl p-3 border border-border" style={{ background: 'var(--color-surface-2)' }}>
                <p className="text-[10px] text-muted-foreground mb-1">{stat.label}</p>
                {stat.value !== null ? (
                  <p className="text-[15px] font-bold text-foreground font-mono">{stat.value}</p>
                ) : (
                  <div className="skeleton h-5 w-16 mt-0.5" />
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3">
            {[
              { name: 'Anthropic', ok: !credits?.ai?.error },
              { name: 'Supabase', ok: true },
              { name: 'Vercel', ok: !credits?.vercel?.error },
              { name: 'Clerk', ok: true },
            ].map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full', s.ok ? 'status-dot-green' : 'status-dot-red')} />
                <span className="text-[11px] text-muted-foreground">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 8: UFC Events */}
      <UfcWidget />
    </div>
  );
}
