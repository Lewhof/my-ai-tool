'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send, Sparkles, Trash2, Loader2, User, Plus, MessageSquare,
  Zap, Brain, ChevronDown, ChevronRight, Globe, Wand2, X, Calendar, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FitnessState, CoachMessage, CoachThread, CoachMode, TrainingPlan } from './types';
import {
  newThread, setActiveThread, appendThreadMessage, deleteThread,
  setThreadPlan, commitPlan, getActivePlan, buildTrainingSummary, applyServerState,
} from './store';

interface Props {
  state: FitnessState;
  dispatch: (m: (s: FitnessState) => FitnessState) => void;
  onPlanCommitted?: () => void;
}

const QUICK_SUGGESTIONS = [
  'How should I structure a week of training for my goal?',
  'What\'s the best way to break through a strength plateau?',
  'How much protein should I eat per day?',
  'Give me a quick form check for the squat',
];

const DEEP_SUGGESTIONS = [
  'I want to train for a Spartan race in 12 weeks while still building muscle. Map out the block.',
  'Help me design a 6-week strength block — current squat 1RM 140kg, bench 100kg, dead 180kg.',
  'I\'m a hybrid athlete — design a week that balances 3 lifting + 3 running sessions without burning out.',
  'I keep getting nagging shoulder pain on bench. What\'s the latest research on cause + fix?',
];

// Human-readable label for a calendar-mutation tool call. The tool name
// + the salient field from the model's input + (when ok) a short outcome
// from the tool result.
function coachToolLabel(tu: import('./types').CoachToolUse): string {
  const input = (tu.input ?? {}) as Record<string, unknown>;
  const result = (tu.result ?? {}) as Record<string, unknown>;
  switch (tu.tool) {
    case 'get_schedule': {
      const count = typeof result.count === 'number' ? result.count : undefined;
      return `Read schedule ${input.from ?? ''} → ${input.to ?? ''}${count !== undefined ? ` (${count} session${count === 1 ? '' : 's'})` : ''}`;
    }
    case 'mark_rest_day': {
      if (tu.ok === false) return `Couldn't mark ${input.date ?? ''} as rest day`;
      const skipped = typeof result.skipped_count === 'number' ? result.skipped_count : 0;
      return skipped === 0
        ? `${input.date ?? ''} already a rest day`
        : `Marked ${input.date ?? ''} as rest day (${skipped} session${skipped === 1 ? '' : 's'} skipped)`;
    }
    case 'skip_session':
      return tu.ok === false
        ? `Couldn't skip session`
        : `Skipped: ${(result.title as string) || 'session'} on ${result.date ?? ''}`;
    case 'reschedule_session':
      return tu.ok === false
        ? `Couldn't reschedule`
        : `Moved ${(result.title as string) || 'session'}: ${result.from_date ?? ''} → ${result.to_date ?? ''}`;
    case 'swap_workout': {
      if (tu.ok === false) return `Couldn't swap workout`;
      const bound = result.bound_to as { kind?: string; name?: string } | undefined;
      return `Swapped workout on ${result.date ?? ''} → ${bound?.name ?? bound?.kind ?? 'new session'}`;
    }
    case 'set_default_training_time': {
      if (tu.ok === false) return `Couldn't set default training time`;
      const t = result.default_training_time as string | null;
      const affected = typeof result.affected_upcoming_sessions === 'number' ? result.affected_upcoming_sessions : 0;
      if (result.changed === false) return `Default training time already ${t ?? '(none)'}`;
      return t === null
        ? `Cleared default training time (back to 18:00)`
        : `Default training time → ${t}${affected > 0 ? ` (${affected} upcoming session${affected === 1 ? '' : 's'} moved)` : ''}`;
    }
    case 'set_session_time': {
      if (tu.ok === false) return `Couldn't set session time`;
      const t = result.time as string | null;
      const title = (result.title as string) || 'session';
      const date = result.date ?? '';
      if (result.changed === false) return `${title} on ${date} already at ${t ?? 'default'}`;
      return t === null
        ? `Cleared time on ${title} (${date}) — back to default`
        : `${title} on ${date} → ${t}`;
    }
    default:
      return tu.tool;
  }
}

export default function CoachView({ state, dispatch, onPlanCommitted }: Props) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamThinking, setStreamThinking] = useState('');
  const [showThreadList, setShowThreadList] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [planPreview, setPlanPreview] = useState<TrainingPlan | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeThread = useMemo(
    () => state.coach_threads.find(t => t.id === state.active_thread_id) || null,
    [state.coach_threads, state.active_thread_id]
  );
  const messages = activeThread?.messages ?? [];
  const mode: CoachMode = activeThread?.mode ?? 'deep';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamText]);

  // Hydrate active thread on first load — pick most recent if none active
  useEffect(() => {
    if (!state.active_thread_id && state.coach_threads.length > 0) {
      setActiveThread(state.coach_threads[0].id, dispatch);
    }
  }, [state.active_thread_id, state.coach_threads, dispatch]);

  const ensureThread = (preferredMode: CoachMode): CoachThread => {
    if (activeThread) return activeThread;
    return newThread(preferredMode, dispatch);
  };

  const sendMessage = async (text: string, sendMode?: CoachMode) => {
    if (!text.trim() || streaming) return;
    const thread = ensureThread(sendMode ?? mode);
    const useMode = sendMode ?? thread.mode;

    const userMsg: CoachMessage = {
      id: 'm-' + Date.now(),
      role: 'user',
      content: text.trim(),
      created_at: new Date().toISOString(),
    };
    appendThreadMessage(thread.id, userMsg, dispatch);
    setInput('');
    setStreaming(true);
    setStreamText('');
    setStreamThinking('');

    try {
      const activePlan = getActivePlan(state);
      const summary = buildTrainingSummary(state);
      const context = {
        profile: state.profile ? {
          goal: state.profile.goals.length === 1 ? state.profile.goals[0] : `hybrid (${state.profile.goals.join(', ')})`,
          difficulty: state.profile.difficulty,
          weight_kg: state.profile.weight_kg,
          weekly_target: state.profile.weekly_target,
        } : undefined,
        // Rich digest of EVERYTHING — both manual sessions AND Garmin/external imports
        // — aggregated into actionable signals (mileage, volume, streak, gaps).
        training_summary: summary,
        recent_prs: state.prs.slice(-5).map(p => ({
          exercise: p.exercise_name,
          type: p.type,
          value: p.value,
          unit: p.unit,
        })),
        active_plan: activePlan ? {
          name: activePlan.name,
          week_num: 1,
          weeks_total: activePlan.weeks.length,
        } : null,
      };

      const apiMessages = [...messages, userMsg].map(m => ({
        role: m.role === 'coach' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

      const endpoint = useMode === 'deep' ? '/api/lhfitness/coach/v2' : '/api/lhfitness/coach';
      const requestBody = useMode === 'deep'
        ? { messages: apiMessages, context, thinking_budget: 4096, enable_web_search: true }
        : { messages: apiMessages, context };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok || !res.body) throw new Error(`coach unavailable (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        // Strip any meta/error tail from the visible stream display
        const visiblePortion = full.split('\n\n[[META]]')[0].split('\n\n[[ERROR]]')[0];
        setStreamText(visiblePortion);
      }

      // Extract meta if present
      let visible = full;
      let thinking: string | undefined;
      let toolUses: CoachMessage['tool_uses'] | undefined;
      let stateInvalidated = false;
      const metaIdx = full.indexOf('\n\n[[META]]');
      if (metaIdx >= 0) {
        visible = full.slice(0, metaIdx);
        const metaJson = full.slice(metaIdx + '\n\n[[META]]'.length);
        try {
          const meta = JSON.parse(metaJson);
          thinking = meta.thinking;
          toolUses = meta.tool_uses;
          stateInvalidated = Boolean(meta.state_invalidated);
        } catch { /* ignore malformed meta */ }
      }
      const errorIdx = full.indexOf('\n\n[[ERROR]]');
      if (errorIdx >= 0) {
        visible = full.slice(0, errorIdx);
        const errMsg = full.slice(errorIdx + '\n\n[[ERROR]]'.length);
        toast.error(errMsg.slice(0, 100));
      }

      // Fallback: if the model returned no visible text but DID fire tools
      // (extended-thinking + tool_use sometimes produces no text turn), render
      // the tool outcomes as the message body so the user always sees what
      // actually happened — instead of a blank-looking "disappeared" turn.
      let visibleTrimmed = visible.trim();
      if (!visibleTrimmed && toolUses && toolUses.length > 0) {
        const toolLabels = toolUses
          .filter(tu => tu.tool !== 'web_search')
          .map(tu => `✓ ${coachToolLabel(tu)}`)
          .filter(Boolean);
        if (toolLabels.length > 0) {
          visibleTrimmed = toolLabels.join('\n');
        }
      }

      const coachMsg: CoachMessage = {
        id: 'm-' + Date.now() + '-c',
        role: 'coach',
        content: visibleTrimmed,
        thinking,
        tool_uses: toolUses,
        created_at: new Date().toISOString(),
      };
      appendThreadMessage(thread.id, coachMsg, dispatch);
      setStreamText('');
      setStreamThinking('');

      // If server-side mutation tools fired, the lhfitness_state row was
      // updated server-side — pull the fresh blob and overwrite local so
      // calendar/today/profile views all reflect the change immediately.
      if (stateInvalidated) {
        try {
          const r = await fetch('/api/lhfitness/state', { cache: 'no-store' });
          if (r.ok) {
            const data = await r.json() as { state: FitnessState | null };
            if (data.state) applyServerState(data.state);
          }
        } catch { /* user can refresh manually if sync glitches */ }
      }
    } catch (e) {
      const errMsg: CoachMessage = {
        id: 'm-' + Date.now() + '-e',
        role: 'coach',
        content: '⚠️ Coach is offline right now. Please try again in a moment.',
        created_at: new Date().toISOString(),
      };
      appendThreadMessage(thread.id, errMsg, dispatch);
      setStreamText('');
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startSynthesis = async () => {
    if (!activeThread || activeThread.messages.length < 2) {
      toast.error('Have a longer chat with the coach first');
      return;
    }
    setSynthesizing(true);
    try {
      const res = await fetch('/api/lhfitness/coach/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: activeThread.messages.map(m => ({
            role: m.role === 'coach' ? 'assistant' : 'user',
            content: m.content,
          })),
          context: {
            profile: state.profile ? {
              goals: state.profile.goals,
              difficulty: state.profile.difficulty,
              weight_kg: state.profile.weight_kg,
              weekly_target: state.profile.weekly_target,
              available_equipment: state.profile.available_equipment,
            } : undefined,
            library_workouts: state.workouts.slice(0, 30).map(w => ({
              id: w.id,
              name: w.name,
              goal: w.goal,
              difficulty: w.difficulty,
              duration_min: w.duration_min,
              primary_muscles: w.primary_muscles,
              equipment: w.equipment,
            })),
            // Anchor plan progression to actual baseline (sessions + Garmin imports)
            training_summary: buildTrainingSummary(state),
          },
          weeks: 4,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Synthesis failed');
      }
      const data = await res.json();
      setPlanPreview({ ...data.plan, coach_thread_id: activeThread.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Synthesis failed');
    } finally {
      setSynthesizing(false);
    }
  };

  const commitPreviewPlan = (plan: TrainingPlan) => {
    commitPlan(plan, dispatch);
    if (activeThread) setThreadPlan(activeThread.id, plan.id, dispatch);
    toast.success(`Plan "${plan.name}" committed to calendar`);
    setPlanPreview(null);
    onPlanCommitted?.();
  };

  const handleNewThread = (newMode: CoachMode) => {
    newThread(newMode, dispatch);
    setShowThreadList(false);
  };

  const handleDeleteThread = (id: string) => {
    if (!confirm('Delete this conversation?')) return;
    deleteThread(id, dispatch);
  };

  const showCTA = activeThread && messages.length >= 2 &&
    messages[messages.length - 1].role === 'coach' && !streaming &&
    !activeThread.resulting_plan_id;

  return (
    <div className="flex h-[calc(100vh-200px)] sm:h-[calc(100vh-160px)] -mx-4 sm:mx-0">
      {/* Thread list sidebar — desktop */}
      <div className="hidden lg:flex flex-col w-64 border-r border-border pr-3 mr-3 overflow-hidden">
        <ThreadListHeader onNew={handleNewThread} />
        <ThreadList
          threads={state.coach_threads}
          activeId={state.active_thread_id}
          onSelect={(id) => setActiveThread(id, dispatch)}
          onDelete={handleDeleteThread}
        />
      </div>

      {/* Mobile thread drawer */}
      {showThreadList && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setShowThreadList(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-background border-r border-border flex flex-col safe-top safe-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-3 border-b border-border flex items-center justify-between">
              <p className="font-bold text-foreground">Conversations</p>
              <button onClick={() => setShowThreadList(false)} className="text-muted-foreground"><X size={18} /></button>
            </div>
            <ThreadListHeader onNew={(m) => { handleNewThread(m); }} />
            <ThreadList
              threads={state.coach_threads}
              activeId={state.active_thread_id}
              onSelect={(id) => { setActiveThread(id, dispatch); setShowThreadList(false); }}
              onDelete={handleDeleteThread}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 sm:px-0 pb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowThreadList(true)}
                className="lg:hidden text-muted-foreground hover:text-foreground"
              >
                <MessageSquare size={18} />
              </button>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2 min-w-0">
                <Sparkles className="text-primary shrink-0" size={24} /> AI Coach
              </h1>
            </div>
            {activeThread && <p className="text-muted-foreground text-xs mt-1 truncate">{activeThread.title}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ModeBadge mode={mode} thread={activeThread} dispatch={dispatch} />
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-0 space-y-4 pb-2">
          {messages.length === 0 && !streaming && (
            <EmptyState mode={mode} onSuggest={(s) => sendMessage(s)} />
          )}

          {messages.map(m => <MessageBubble key={m.id} message={m} />)}

          {streaming && (
            <MessageBubble
              message={{
                id: 'streaming',
                role: 'coach',
                content: streamText || '',
                thinking: streamThinking || undefined,
                created_at: new Date().toISOString(),
              }}
              streaming={!streamText}
              isStreamingNow={true}
            />
          )}

          {/* Build-the-plan CTA */}
          {showCTA && (
            <div className="flex justify-center pt-2">
              <button
                onClick={startSynthesis}
                disabled={synthesizing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 hover:border-primary/50 transition-all"
              >
                {synthesizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {synthesizing ? 'Synthesising plan...' : 'Build the plan from this conversation'}
              </button>
            </div>
          )}

          {/* Plan committed badge */}
          {activeThread?.resulting_plan_id && (
            <div className="flex justify-center pt-2">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Check size={12} /> Plan committed to your calendar
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 sm:px-0 pb-2 sm:pb-0 border-t border-border pt-3 bg-background">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'deep' ? 'Ask anything — I\'ll research and think it through...' : 'Quick question...'}
                rows={1}
                disabled={streaming}
                className="w-full bg-card border border-border rounded-xl px-4 py-2.5 pr-12 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none resize-none max-h-32 disabled:opacity-60"
                style={{ minHeight: '44px' }}
              />
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center transition-all shrink-0',
                input.trim() && !streaming
                  ? 'bg-primary text-primary-foreground btn-brand'
                  : 'bg-card border border-border text-muted-foreground cursor-not-allowed'
              )}
            >
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Plan review modal */}
      {planPreview && state.profile && (
        <PlanReviewModal
          plan={planPreview}
          state={state}
          onClose={() => setPlanPreview(null)}
          onCommit={commitPreviewPlan}
        />
      )}
    </div>
  );
}

function ModeBadge({
  mode, thread, dispatch,
}: {
  mode: CoachMode;
  thread: CoachThread | null;
  dispatch: (m: (s: FitnessState) => FitnessState) => void;
}) {
  const switchMode = (next: CoachMode) => {
    if (!thread) return;
    dispatch((s) => ({
      ...s,
      coach_threads: s.coach_threads.map(t =>
        t.id === thread.id ? { ...t, mode: next } : t
      ),
    }));
  };

  return (
    <div className="inline-flex items-center bg-card border border-border rounded-full p-0.5">
      <button
        onClick={() => switchMode('quick')}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors',
          mode === 'quick' ? 'bg-blue-500/15 text-blue-400' : 'text-muted-foreground hover:text-foreground'
        )}
        title="Quick: fast, cheap (Haiku)"
      >
        <Zap size={11} /> Quick
      </button>
      <button
        onClick={() => switchMode('deep')}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors',
          mode === 'deep' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
        title="Deep: web research + extended thinking (Sonnet)"
      >
        <Brain size={11} /> Deep
      </button>
    </div>
  );
}

function ThreadListHeader({ onNew }: { onNew: (mode: CoachMode) => void }) {
  return (
    <div className="px-1 pt-1 pb-3 space-y-1.5">
      <button
        onClick={() => onNew('deep')}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground btn-brand"
      >
        <Plus size={14} /> New conversation
      </button>
      <button
        onClick={() => onNew('quick')}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground"
      >
        <Zap size={11} /> + Quick chat
      </button>
    </div>
  );
}

function ThreadList({
  threads, activeId, onSelect, onDelete,
}: {
  threads: CoachThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (threads.length === 0) {
    return <p className="text-muted-foreground text-xs px-3 py-4 text-center">No conversations yet.</p>;
  }
  return (
    <div className="flex-1 overflow-y-auto space-y-1 px-1">
      {threads.map(t => (
        <div
          key={t.id}
          className={cn(
            'group flex items-center gap-2 rounded-lg pl-2.5 pr-1 py-1.5 cursor-pointer',
            activeId === t.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-secondary border border-transparent'
          )}
          onClick={() => onSelect(t.id)}
        >
          <div className="flex-1 min-w-0">
            <p className={cn('text-xs font-medium truncate', activeId === t.id ? 'text-primary' : 'text-foreground')}>
              {t.title}
            </p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              {t.mode === 'deep' ? <Brain size={9} /> : <Zap size={9} />}
              {t.messages.length} msg · {new Date(t.updated_at).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-red-400"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ mode, onSuggest }: { mode: CoachMode; onSuggest: (s: string) => void }) {
  const suggestions = mode === 'deep' ? DEEP_SUGGESTIONS : QUICK_SUGGESTIONS;
  return (
    <div className="text-center py-10">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4">
        {mode === 'deep' ? <Brain className="text-primary" size={28} /> : <Zap className="text-blue-400" size={28} />}
      </div>
      <p className="text-foreground font-bold">{mode === 'deep' ? 'Deep coach ready' : 'Quick coach ready'}</p>
      <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
        {mode === 'deep'
          ? 'I\'ll research, debate, and synthesise a plan for the calendar. Best for programming + strategy.'
          : 'Fast answers for form, quick questions, definitions. Cheap and snappy.'}
      </p>
      <div className="mt-6 space-y-2 max-w-md mx-auto px-4">
        {suggestions.map(s => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="block w-full text-left px-4 py-2.5 rounded-xl bg-card border border-border hover:border-primary/40 text-sm text-foreground transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message, streaming, isStreamingNow,
}: {
  message: CoachMessage; streaming?: boolean; isStreamingNow?: boolean;
}) {
  const isUser = message.role === 'user';
  const [thinkingOpen, setThinkingOpen] = useState(false);

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
        isUser ? 'bg-secondary text-foreground' : 'bg-primary/15 text-primary'
      )}>
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>
      <div className={cn(
        'max-w-[85%] sm:max-w-[75%] space-y-2',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* Thinking */}
        {message.thinking && !isUser && (
          <button
            onClick={() => setThinkingOpen(o => !o)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground bg-card border border-border rounded-lg px-2.5 py-1"
          >
            {thinkingOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <Brain size={10} /> Thinking
            {thinkingOpen && <span className="text-muted-foreground/60 ml-1">— click to collapse</span>}
          </button>
        )}
        {message.thinking && thinkingOpen && (
          <div className="bg-secondary/60 border border-border rounded-lg px-3 py-2 text-[11px] text-muted-foreground italic max-h-48 overflow-y-auto whitespace-pre-wrap">
            {message.thinking}
          </div>
        )}

        {/* Tool uses (web search + calendar mutations) */}
        {message.tool_uses && message.tool_uses.length > 0 && !isUser && (
          <div className="bg-card border border-border rounded-lg p-2.5 text-[11px] space-y-1.5">
            {message.tool_uses.map((tu, i) => (
              <div key={i}>
                {tu.tool === 'web_search' ? (
                  <>
                    <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                      <Globe size={10} className="text-blue-400" />
                      Searched: &quot;{tu.query || '...'}&quot;
                    </div>
                    {tu.sources && tu.sources.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-4">
                        {tu.sources.slice(0, 4).map((s, j) => (
                          <li key={j} className="truncate">
                            <a href={s.url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:underline truncate text-[10px]">
                              {s.title || s.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 font-medium">
                    {tu.ok === false ? (
                      <X size={10} className="text-red-400" />
                    ) : (
                      <Check size={10} className="text-emerald-400" />
                    )}
                    <span className={tu.ok === false ? 'text-red-300' : 'text-emerald-300'}>
                      {coachToolLabel(tu)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={cn(
          'rounded-2xl px-4 py-2.5',
          isUser
            ? 'bg-primary/15 border border-primary/30 text-foreground rounded-br-md'
            : 'bg-card border border-border text-foreground rounded-bl-md'
        )}>
          {streaming ? (
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: '300ms' }} />
            </span>
          ) : (
            <CoachContent text={message.content} />
          )}
          {isStreamingNow && message.content && (
            <span className="inline-block w-1.5 h-3.5 bg-primary ml-0.5 animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

function CoachContent({ text }: { text: string }) {
  if (!text) return null;
  const blocks = text.split(/\n\n+/);
  return (
    <div className="text-sm leading-relaxed space-y-2.5">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const isList = lines.every(l => /^\s*[-*]\s|^\s*\d+\.\s/.test(l)) && lines.length > 1;
        if (isList) {
          return (
            <ul key={i} className="list-disc list-outside ml-5 space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.replace(/^\s*[-*]\s|^\s*\d+\.\s/, ''))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-wrap">{renderInline(block)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) parts.push(<strong key={key++} className="text-foreground font-bold">{match[1]}</strong>);
    else if (match[2]) parts.push(<code key={key++} className="bg-secondary px-1 py-0.5 rounded text-[12px] font-mono">{match[2]}</code>);
    else if (match[3]) parts.push(<em key={key++} className="italic">{match[3]}</em>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 0 ? text : parts;
}

// ── Plan review modal ──────────────────────────────────────────────────

function PlanReviewModal({
  plan, state, onClose, onCommit,
}: {
  plan: TrainingPlan;
  state: FitnessState;
  onClose: () => void;
  onCommit: (plan: TrainingPlan) => void;
}) {
  const [edited, setEdited] = useState<TrainingPlan>(plan);
  const workoutById = useMemo(() => {
    const m = new Map(state.workouts.map(w => [w.id, w]));
    return m;
  }, [state.workouts]);

  const updateWeekTheme = (weekIdx: number, theme: string) => {
    setEdited(p => ({
      ...p,
      weeks: p.weeks.map((w, i) => i === weekIdx ? { ...w, theme } : w),
    }));
  };

  const updateDayWorkout = (weekIdx: number, dayIdx: number, workoutId: string | undefined) => {
    setEdited(p => ({
      ...p,
      weeks: p.weeks.map((w, i) => {
        if (i !== weekIdx) return w;
        return {
          ...w,
          days: w.days.map((d, di) => {
            if (di !== dayIdx) return d;
            return { ...d, workout_id: workoutId };
          }),
        };
      }),
    }));
  };

  const dayName = (offset: number) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][offset];

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-up">
      <div className="bg-background border-t sm:border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-start gap-3 sticky top-0 bg-background z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} className="text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold">Plan ready · review before commit</span>
            </div>
            <input
              value={edited.name}
              onChange={(e) => setEdited({ ...edited, name: e.target.value })}
              className="text-foreground font-bold text-xl bg-transparent border-b border-transparent hover:border-border focus:border-primary/60 focus:outline-none w-full"
            />
            <textarea
              value={edited.description}
              onChange={(e) => setEdited({ ...edited, description: e.target.value })}
              rows={2}
              className="text-muted-foreground text-sm mt-1 bg-transparent border-b border-transparent hover:border-border focus:border-primary/60 focus:outline-none w-full resize-none"
            />
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              <span>{edited.weeks.length} week{edited.weeks.length === 1 ? '' : 's'}</span>
              <span>·</span>
              <span>Starts {new Date(edited.starts_on).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span>·</span>
              <span className="capitalize">{edited.goals.join(' + ')}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground -mt-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {edited.weeks.map((week, wi) => (
            <div key={week.week_num} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-foreground font-bold text-sm">Week {week.week_num}</p>
                <input
                  value={week.theme || ''}
                  onChange={(e) => updateWeekTheme(wi, e.target.value)}
                  placeholder="theme (e.g. Volume base, Deload)"
                  className="text-muted-foreground text-xs bg-secondary border border-border rounded px-2 py-1 w-48 focus:border-primary/60 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {week.days.map((day, di) => (
                  <div
                    key={di}
                    className={cn(
                      'rounded-lg p-2 min-h-[80px] text-[10px]',
                      day.type === 'rest' ? 'bg-secondary/30 border border-dashed border-border' : 'bg-secondary border border-border'
                    )}
                  >
                    <p className="text-muted-foreground font-bold uppercase tracking-wide mb-1">{dayName(day.day_offset)}</p>
                    {day.type === 'rest' ? (
                      <p className="text-muted-foreground italic">Rest</p>
                    ) : day.workout_id && workoutById.has(day.workout_id) ? (
                      <select
                        value={day.workout_id}
                        onChange={(e) => updateDayWorkout(wi, di, e.target.value || undefined)}
                        className="w-full bg-card border border-border rounded px-1 py-0.5 text-[10px] text-foreground"
                      >
                        {state.workouts.map(w => (
                          <option key={w.id} value={w.id}>{w.name.length > 20 ? w.name.slice(0, 18) + '…' : w.name}</option>
                        ))}
                      </select>
                    ) : day.template ? (
                      <>
                        <p className="text-foreground font-medium leading-tight">{day.template.name}</p>
                        {day.template.duration_min && <p className="text-muted-foreground mt-0.5">{day.template.duration_min}m</p>}
                        {day.template.intensity && <p className="text-muted-foreground capitalize">{day.template.intensity}</p>}
                      </>
                    ) : (
                      <p className="text-muted-foreground italic">{day.type}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2 sticky bottom-0 bg-background">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary"
          >
            Discard
          </button>
          <button
            onClick={() => onCommit(edited)}
            className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground btn-brand flex items-center justify-center gap-2"
          >
            <Calendar size={14} /> Commit to calendar
          </button>
        </div>
      </div>
    </div>
  );
}
