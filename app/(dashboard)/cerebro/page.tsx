'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Send, Loader2, Bot, User, Sparkles, Mic, MicOff, Camera, X,
  Calendar, CheckSquare, ClipboardList, FileText,
  StickyNote, Cloud, CreditCard, BookOpen, Search,
  ChevronDown, MoreHorizontal, Archive, Trash2,
  Brain, ThumbsUp, ThumbsDown,
} from 'lucide-react';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  feedback?: 'up' | 'down';
}

const SLASH_COMMANDS = [
  { cmd: '/dev', desc: 'Build now \u2014 queue for dev', example: '/dev Add contact form page', highlight: true },
  { cmd: '/ship', desc: 'Auto-build \u2014 no approval', example: '/ship Fix button color', highlight: true },
  { cmd: '/bug', desc: 'Report bug \u2014 urgent fix', example: '/bug Calendar wrong time', highlight: true },
  { cmd: '/board', desc: 'Add to whiteboard backlog', example: '/board AI email templates', highlight: true },
  { cmd: '/scope', desc: 'Deep research + SSA spec', example: '/scope Financial module', highlight: true },
  { cmd: '/plan', desc: 'Implementation plan only', example: '/plan Capacitor native app', highlight: true },
  { cmd: '/pending', desc: 'Show dev pipeline status', example: '/pending', highlight: true },
  { cmd: '/task', desc: 'Create a task', example: '/task Review contracts' },
  { cmd: '/note', desc: 'Save a note', example: '/note Meeting recap' },
  { cmd: '/image', desc: 'Generate image', example: '/image A futuristic city' },
  { cmd: '/search', desc: 'Web search', example: '/search Latest Next.js features' },
  { cmd: '/whiteboard', desc: 'Add to backlog', example: '/whiteboard New feature idea' },
  { cmd: '/kb', desc: 'Search knowledge base', example: '/kb AI stack' },
  { cmd: '/calendar', desc: 'Check calendar', example: '/calendar' },
  { cmd: '/todos', desc: 'Show tasks', example: '/todos' },
  { cmd: '/email', desc: 'Check email', example: '/email' },
  { cmd: '/weather', desc: 'Get weather', example: '/weather' },
  { cmd: '/credits', desc: 'AI usage', example: '/credits' },
];

const SUGGESTED_PROMPTS = [
  { icon: Calendar, text: "What's on my calendar today?", color: 'oklch(0.60 0.20 255)' },
  { icon: CheckSquare, text: 'Show me my pending tasks', color: 'oklch(0.55 0.18 160)' },
  { icon: FileText, text: 'Search my documents for contracts', color: 'oklch(0.65 0.16 290)' },
  { icon: Cloud, text: "What's the weather like?", color: 'oklch(0.62 0.18 200)' },
  { icon: CreditCard, text: 'How much have I spent on AI this month?', color: 'var(--color-brand)' },
  { icon: Search, text: 'Search the web for latest Next.js features', color: 'oklch(0.60 0.18 55)' },
];

function AgentPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [replyTo, setReplyTo] = useState<{ index: number; content: string; role: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialPromptHandled = useRef(false);

  const loadHistory = () => {
    fetch('/api/cerebro/history')
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length) {
          const newMsgs = data.messages.map((m: { id?: string; role: string; content: string }) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));
          // Only update if message count changed (avoids scroll jump)
          setMessages(prev => newMsgs.length !== prev.length ? newMsgs : prev);
        }
      })
      .catch(() => {});
  };

  const sendFeedback = async (messageId: string, rating: 'up' | 'down', msgIndex: number) => {
    let correction: string | null = null;
    if (rating === 'down') {
      correction = prompt('What should I have done differently? (Optional — leave blank to just flag)');
      if (correction === null) return; // user cancelled
    }
    const res = await fetch('/api/cerebro/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId, rating, correction_text: correction || null }),
    });
    if (res.ok) {
      setMessages((prev) => prev.map((m, i) => i === msgIndex ? { ...m, feedback: rating } : m));
      toast.success(rating === 'up' ? 'Thanks for the feedback' : 'Feedback captured — review in Brain');
    } else {
      toast.error('Feedback failed');
    }
  };

  useEffect(() => {
    loadHistory();
    // Poll for new messages every 10 seconds (catches executor plans)
    const poll = setInterval(loadHistory, 10000);
    return () => clearInterval(poll);
  }, []);

  // Handle inbound ?prompt= from Dashboard Cerebro widget — auto-send once on mount
  useEffect(() => {
    if (initialPromptHandled.current) return;
    const promptParam = searchParams.get('prompt');
    if (promptParam && promptParam.trim()) {
      initialPromptHandled.current = true;
      sendMessage(promptParam);
      // Defer URL cleanup so sendMessage's state updates commit first
      setTimeout(() => router.replace('/cerebro'), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) { toast.error('Voice not supported. Try Chrome or Edge.'); return; }
    const recognition = new (SR as new () => SpeechRecognition)();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      setInput(Array.from(event.results).map((r) => r[0].transcript).join(''));
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    toast('Listening...', { description: 'Speak now — tap mic again to stop' });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: '\u{1F4F7} [Photo uploaded for analysis]' }]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('prompt', input.trim() || 'Analyze this image in detail.');
      const res = await fetch('/api/cerebro/vision', { method: 'POST', body: formData });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.analysis || data.error || 'Could not analyze image.' }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error analyzing image.' }]);
    } finally { setLoading(false); setInput(''); }
    e.target.value = '';
  };

  const processSlashCommand = (msg: string): string => {
    if (msg.startsWith('/task ')) return `Create a task: "${msg.slice(6)}"`;
    if (msg.startsWith('/note ')) return `Save a note titled "${msg.slice(6)}" with relevant content`;
    if (msg.startsWith('/image ')) return `Generate an image: ${msg.slice(7)}`;
    if (msg.startsWith('/search ')) return `Search the web for: ${msg.slice(8)}`;
    if (msg.startsWith('/whiteboard ')) return `Add to whiteboard: "${msg.slice(12)}"`;
    if (msg.startsWith('/kb ')) return `Search the knowledge base for: ${msg.slice(4)}`;
    if (msg.startsWith('/pending')) return 'show pending';
    if (msg.startsWith('/calendar')) return 'Show me my calendar events for today and tomorrow';
    if (msg.startsWith('/weather')) return "What's the current weather?";
    if (msg.startsWith('/credits')) return 'Show me my AI usage and credits';
    if (msg.startsWith('/todos')) return 'Show me my pending tasks';
    if (msg.startsWith('/email')) return 'Show me my recent unread emails';
    if (msg.startsWith('/scope ')) return `SSA (Scope, Spec, Advise) for: "${msg.slice(7)}"\n\nDo deep research. Search the web for best practices. Then create a comprehensive document with:\n## Scope\nWhat this entails. Define boundaries.\n## Specification\n- Technical architecture\n- Data models / DB changes\n- API endpoints\n- UI/UX components\n## Advisory\n- Recommended approach\n- Risks and mitigations\n- Complexity (S/M/L)\nSave the result to the Knowledge Base when done.`;
    if (msg.startsWith('/plan ')) return `Create a detailed implementation plan for: "${msg.slice(6)}"\n\nInclude:\n1. Files to create/modify (with paths)\n2. Step-by-step implementation order\n3. Key technical decisions\n4. Dependencies needed\n5. Testing approach\n\nDo NOT execute anything. Just plan. Save to Knowledge Base when done.`;
    return msg;
  };

  // Direct action commands — bypass Cerebro AI, go straight to APIs
  // Save messages to Cerebro thread so they persist across refresh
  const saveToHistory = async (userMsg: string, assistantMsg: string) => {
    try {
      // Use a lightweight endpoint to save both messages
      await fetch('/api/cerebro/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: userMsg, assistantMessage: assistantMsg }),
      });
    } catch { /* non-critical */ }
  };

  // Trigger the cron executor immediately (fire-and-forget)
  const triggerExecutor = () => {
    fetch('/api/cron/trigger', { method: 'POST' }).catch(() => {});
  };

  const handleDirectCommand = async (rawMsg: string): Promise<boolean> => {
    const post = (url: string, body: Record<string, unknown>) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    // /dev — immediate dev task, queue for plan + approval
    if (rawMsg.startsWith('/dev ')) {
      const title = rawMsg.slice(5).trim();
      setMessages(prev => [...prev, { role: 'user', content: rawMsg }]);
      await post('/api/tasks', { title, description: `Dev command: build immediately.\n\n${title}`, whiteboard_id: null });
      const response = `\u{1F6E0}\u{FE0F} **Queued for dev: ${title}**\n\nGenerating plan now...`;
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      saveToHistory(rawMsg, response);
      triggerExecutor();
      toast('Dev task queued');
      return true;
    }

    // /ship — auto-approved, no approval needed. Uses status 'approved' directly.
    if (rawMsg.startsWith('/ship ')) {
      const title = rawMsg.slice(6).trim();
      setMessages(prev => [...prev, { role: 'user', content: rawMsg }]);
      await post('/api/tasks', { title, description: `Ship command: auto-approved, build and deploy.\n\n${title}`, status: 'approved' });
      const response = `\u{1F680} **Shipping: ${title}**\n\nAuto-approved. Building now...`;
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      saveToHistory(rawMsg, response);
      triggerExecutor();
      toast('Shipping \u2014 auto-approved');
      return true;
    }

    // /bug — urgent task, fast-track
    if (rawMsg.startsWith('/bug ')) {
      const title = rawMsg.slice(5).trim();
      setMessages(prev => [...prev, { role: 'user', content: rawMsg }]);
      await post('/api/tasks', { title: `[BUG] ${title}`, description: `Bug report: fix urgently.\n\n${title}`, priority: 'urgent' });
      const response = `\u{1F41B} **Bug reported: ${title}**\n\nGenerating fix plan now...`;
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      saveToHistory(rawMsg, response);
      triggerExecutor();
      toast('Bug reported');
      return true;
    }

    // /pending — show dev pipeline (handle client-side to avoid AI fallthrough)
    if (rawMsg === '/pending' || rawMsg.startsWith('/pending')) {
      setMessages(prev => [...prev, { role: 'user', content: rawMsg }]);
      setLoading(true);
      try {
        const res = await fetch('/api/cerebro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'show pending', history: [] }),
        });
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response || 'No pending tasks.' }]);
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error loading pipeline.' }]);
      } finally { setLoading(false); }
      return true;
    }

    // /board — add to whiteboard backlog
    if (rawMsg.startsWith('/board ')) {
      const title = rawMsg.slice(7).trim();
      setMessages(prev => [...prev, { role: 'user', content: rawMsg }]);
      await post('/api/whiteboard', { title, status: 'idea', priority: 99, tags: ['cerebro'] });
      const response = `\u{1F4CB} **Added to whiteboard: ${title}**\n\nStatus: Idea. You can scope and prioritize it later.`;
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      saveToHistory(rawMsg, response);
      toast('Added to whiteboard');
      return true;
    }

    // /scope and /plan — route through sendMessage which handles SSE streaming
    if (rawMsg.startsWith('/scope ') || rawMsg.startsWith('/plan ')) {
      return false; // fall through to sendMessage → processSlashCommand
    }

    return false;
  };

  const sendMessage = async (text?: string) => {
    const rawMsg = text || input.trim();
    if (!rawMsg || loading) return;

    // Check for direct action commands first
    setInput('');
    const handled = await handleDirectCommand(rawMsg);
    if (handled) { inputRef.current?.focus(); return; }

    const msg = processSlashCommand(rawMsg);
    const fullMsg = replyTo ? `> Replying to: "${replyTo.content.slice(0, 150)}"\n\n${msg}` : msg;
    setReplyTo(null);
    setMessages((prev) => [...prev, { role: 'user', content: fullMsg }]);
    setLoading(true);
    // Add placeholder assistant message, then stream into it
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    try {
      const res = await fetch('/api/cerebro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullMsg, history: messages.slice(-20) }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => 'Agent error');
        setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: `Error: ${err}` }; return u; });
        return;
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        // Shortcut command response (show pending, approve, etc.)
        const data = await res.json();
        setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { id: data.assistant_message_id, role: 'assistant', content: data.response || 'No response.' }; return u; });
      } else {
        // SSE stream
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'text') {
                setMessages((prev) => {
                  const u = [...prev];
                  const last = u[u.length - 1];
                  u[u.length - 1] = { ...last, content: last.content + event.content };
                  return u;
                });
              } else if (event.type === 'tool_call') {
                setMessages((prev) => {
                  const u = [...prev];
                  const last = u[u.length - 1];
                  const status = last.content ? last.content + `\n\n_Using ${event.name}..._` : `_Using ${event.name}..._`;
                  u[u.length - 1] = { ...last, content: status };
                  return u;
                });
              } else if (event.type === 'done') {
                setMessages((prev) => {
                  const u = [...prev];
                  const last = u[u.length - 1];
                  // Strip tool status lines from final content, attach message ID
                  const cleaned = last.content.replace(/\n*_Using \w+\.\.\._\n*/g, '').trim();
                  u[u.length - 1] = { ...last, id: event.assistant_message_id, content: cleaned || 'Done.' };
                  return u;
                });
              } else if (event.type === 'error') {
                setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: `Error: ${event.message}` }; return u; });
              }
            } catch { /* skip malformed SSE line */ }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Network error'}` }; return u; });
    } finally { setLoading(false); inputRef.current?.focus(); }
  };

  const archiveAndClear = async () => {
    const content = messages.map((m) => `**${m.role === 'user' ? 'You' : 'Cerebro'}:**\n${m.content}`).join('\n\n---\n\n');
    await fetch('/api/kb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Cerebro Archive \u2014 ${new Date().toLocaleDateString('en-ZA')}`, content, category: 'Reference', tags: ['cerebro', 'archive'] }),
    });
    await fetch('/api/cerebro/history', { method: 'DELETE' });
    setMessages([]);
    toast('Conversation archived to Knowledge Base');
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0" style={{ background: 'var(--color-surface-1)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center cerebro-pulse" style={{ background: 'var(--color-brand)' }}>
          <Bot size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-foreground">Cerebro</p>
          <p className="text-[11px] text-muted-foreground">Claude Sonnet &middot; access to all your tools</p>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/cerebro/brain"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground border border-border hover:bg-surface-2 transition-colors"
            title="Cerebro Brain — rules, metrics, corrections">
            <Brain size={12} /> Brain
          </Link>
          {hasMessages && (
            <>
              <button onClick={archiveAndClear}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground border border-border hover:bg-surface-2 transition-colors">
                <Archive size={12} /> Archive
              </button>
              <button onClick={async () => {
                if (!confirm('Clear conversation?')) return;
                await fetch('/api/cerebro/history', { method: 'DELETE' });
                setMessages([]);
                toast('Conversation cleared');
              }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-surface-2 transition-colors">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto"
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          if (file.type.startsWith('image/')) {
            handleImageUpload({ target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>);
          }
        }}
      >
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="relative w-20 h-20 rounded-3xl flex items-center justify-center mb-5 cerebro-pulse" style={{ background: 'var(--color-brand)' }}>
              <Sparkles size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">What can I help with?</h2>
            <p className="text-[13px] text-muted-foreground max-w-xs leading-relaxed">
              I can access your calendar, tasks, documents, notes, whiteboard, and more. Just ask.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 w-full max-w-sm">
              {SUGGESTED_PROMPTS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <button key={i} onClick={() => sendMessage(p.text)}
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-border hover:bg-surface-2 transition-all text-left"
                    style={{ background: 'var(--color-surface-1)' }}>
                    <Icon size={14} className="shrink-0 mt-0.5" style={{ color: p.color }} />
                    <span className="text-[12px] text-foreground/80 leading-snug">{p.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="px-3 sm:px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex gap-2 sm:gap-3 animate-fade-up group', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--color-brand)' }}>
                    <Bot size={14} className="text-white" />
                  </div>
                )}
                <div className={cn(
                  'max-w-[90%] sm:max-w-[85%] rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3',
                  msg.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'
                )} style={
                  msg.role === 'user'
                    ? { background: 'var(--color-brand)', color: 'white' }
                    : { background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }
                }>
                  {msg.role === 'assistant' ? (
                    <div>
                      {msg.content.includes('IMAGE_GENERATED:') && (() => {
                        const match = msg.content.match(/IMAGE_GENERATED:(https?:\/\/[^\s\n]+)/);
                        const imageUrl = match?.[1];
                        const textContent = msg.content.replace(/IMAGE_GENERATED:https?:\/\/[^\s\n]+\n*/, '').trim();
                        return (
                          <>
                            {imageUrl && (
                              <div className="mb-3">
                                <img src={imageUrl} alt="Generated" className="max-w-full rounded-lg border border-border" />
                                <a href={imageUrl} target="_blank" download className="text-[11px] mt-1 inline-block" style={{ color: 'var(--color-brand)' }}>Download image</a>
                              </div>
                            )}
                            {textContent && <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown></div>}
                          </>
                        );
                      })()}
                      {!msg.content.includes('IMAGE_GENERATED:') && (
                        <div className="prose prose-invert prose-sm max-w-none text-[13px] leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content.includes('Reply **"approve"**')
                              ? msg.content.split('---')[0].trim()
                              : msg.content.replace('<!-- SHOW_APPROVAL_BUTTONS -->', '')}
                          </ReactMarkdown>
                        </div>
                      )}
                      {/* Plan approval buttons — show on plan messages and pending pipeline */}
                      {/* Approval buttons — only on the LAST plan message, and only if no approval response follows */}
                      {(msg.content.includes('Reply **"approve"**') || msg.content.includes('SHOW_APPROVAL_BUTTONS')) && (() => {
                        // Check if this plan was already acted on (approved/cancelled message follows)
                        const laterMessages = messages.slice(i + 1);
                        const alreadyActed = laterMessages.some(m =>
                          m.content.includes('**Approved:') ||
                          m.content.includes('**Cancelled:') ||
                          m.content.includes('**Completed:') ||
                          m.content.includes('**Updated:')
                        );
                        if (alreadyActed) return null;
                        return (
                          <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
                            <button
                              onClick={() => sendMessage('approve')}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium text-white btn-brand"
                              style={{ background: 'oklch(0.55 0.18 160)' }}
                            >
                              &#x2705; Approve
                            </button>
                            <button
                              onClick={() => {
                                const feedback = prompt('What should change?');
                                if (feedback) sendMessage(`change: ${feedback}`);
                              }}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium text-muted-foreground border border-border hover:text-foreground hover:bg-surface-2 transition-colors"
                            >
                              &#x270F;&#xFE0F; Change
                            </button>
                            <button
                              onClick={() => sendMessage('cancel')}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium text-muted-foreground border border-border hover:text-destructive transition-colors"
                            >
                              &#x274C; Cancel
                            </button>
                          </div>
                        );
                      })()}
                      {/* Forward actions + feedback thumbs */}
                      {msg.content.length > 10 && (
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                          {[
                            { label: 'Task', fn: () => fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: msg.content.replace(/[#*`>\-]/g, '').trim().slice(0, 100) }) }) },
                            { label: 'Note', fn: () => fetch('/api/notes-v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Cerebro Note', content: msg.content }) }) },
                            { label: 'KB', fn: () => fetch('/api/kb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `Cerebro \u2014 ${new Date().toLocaleDateString()}`, content: msg.content, category: 'Reference', tags: ['cerebro'] }) }) },
                            { label: 'Board', fn: () => fetch('/api/whiteboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: msg.content.replace(/[#*`>\-]/g, '').trim().slice(0, 80), description: msg.content }) }) },
                          ].map((fwd) => (
                            <button key={fwd.label} onClick={async () => { await fwd.fn(); toast(`Saved to ${fwd.label}`); }}
                              className="text-muted-foreground/60 hover:text-foreground text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors">
                              &rarr; {fwd.label}
                            </button>
                          ))}
                          {msg.id && (
                            <div className="ml-auto flex gap-0.5">
                              <button
                                onClick={() => msg.id && sendFeedback(msg.id, 'up', i)}
                                title="Helpful"
                                className={cn(
                                  'p-1 rounded hover:bg-white/10 transition-colors',
                                  msg.feedback === 'up' ? 'text-emerald-400' : 'text-muted-foreground/60 hover:text-foreground'
                                )}
                              >
                                <ThumbsUp size={11} />
                              </button>
                              <button
                                onClick={() => msg.id && sendFeedback(msg.id, 'down', i)}
                                title="Not helpful — teach me"
                                className={cn(
                                  'p-1 rounded hover:bg-white/10 transition-colors',
                                  msg.feedback === 'down' ? 'text-red-400' : 'text-muted-foreground/60 hover:text-foreground'
                                )}
                              >
                                <ThumbsDown size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {/* Reply */}
                <button onClick={() => setReplyTo({ index: i, content: msg.content, role: msg.role })}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-foreground p-1 self-start mt-1 transition-opacity shrink-0" title="Reply">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17H4V12"/><path d="M4 17L13 8C14.66 6.34 17.34 6.34 19 8C20.66 9.66 20.66 12.34 19 14L15 18"/></svg>
                </button>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--color-surface-3)' }}>
                    <User size={14} className="text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-3 animate-fade-up">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--color-brand)' }}>
                  <Bot size={14} className="text-white" />
                </div>
                <div className="rounded-2xl rounded-tl-sm px-4 py-3 border border-border" style={{ background: 'var(--color-surface-2)' }}>
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2].map((j) => (
                      <div key={j} className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-brand)', animation: `cerebro-bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Suggested prompts when has messages */}
      {hasMessages && !loading && (
        <div className="px-4 pb-2 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {SUGGESTED_PROMPTS.slice(0, 4).map((p, i) => {
              const Icon = p.icon;
              return (
                <button key={i} onClick={() => sendMessage(p.text)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border whitespace-nowrap text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors shrink-0"
                  style={{ background: 'var(--color-surface-1)' }}>
                  <Icon size={11} style={{ color: p.color }} /> {p.text}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Slash commands */}
      {input.startsWith('/') && !loading && (
        <div className="px-4 py-2 border-t border-border shrink-0 max-h-48 overflow-auto" style={{ background: 'var(--color-surface-1)' }}>
          {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.split(' ')[0])).map((cmd) => (
            <button key={cmd.cmd} onClick={() => setInput(cmd.cmd + ' ')}
              className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors text-left',
                (cmd as { highlight?: boolean }).highlight && 'border-l-2'
              )}
              style={(cmd as { highlight?: boolean }).highlight ? { borderColor: 'var(--color-brand)' } : {}}>
              <div>
                <span className="text-[13px] font-mono" style={{ color: (cmd as { highlight?: boolean }).highlight ? 'var(--color-brand)' : 'var(--color-muted-foreground)' }}>{cmd.cmd}</span>
                <span className="text-muted-foreground text-[11px] ml-2">{cmd.desc}</span>
              </div>
              <span className="text-muted-foreground/40 text-[10px]">{cmd.example}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 py-2 border-t border-border flex items-start gap-2 shrink-0" style={{ background: 'var(--color-surface-1)' }}>
          <div className="border-l-2 pl-3 flex-1 min-w-0" style={{ borderColor: 'var(--color-brand)' }}>
            <p className="text-[11px] font-medium mb-0.5" style={{ color: 'var(--color-brand)' }}>
              Replying to {replyTo.role === 'user' ? 'yourself' : 'Cerebro'}
            </p>
            <p className="text-muted-foreground text-[11px] truncate">{replyTo.content.slice(0, 100)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0 p-1"><X size={14} /></button>
        </div>
      )}

      {/* Input bar */}
      <div className="px-2 sm:px-4 pb-3 sm:pb-4 pt-2 shrink-0 border-t border-border" style={{ background: 'var(--color-surface-1)' }}>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex items-end gap-1.5 sm:gap-2">
            <button onClick={toggleVoice}
              className={cn('w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-200 shrink-0',
                listening ? 'border-red-400/60 text-red-400 animate-pulse' : 'border-border text-muted-foreground hover:text-foreground hover:bg-surface-2'
              )} style={listening ? { background: 'oklch(0.62 0.22 25 / 0.15)' } : {}}>
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground border border-border hover:bg-surface-2 transition-colors shrink-0">
              <Camera size={16} />
            </button>
            <div className="flex-1 relative min-w-0">
              <textarea ref={inputRef} value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                onPaste={(e) => {
                  // Detect pasted images from clipboard
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (const item of Array.from(items)) {
                    if (item.type.startsWith('image/')) {
                      const file = item.getAsFile();
                      if (file) {
                        e.preventDefault();
                        toast('Pasted image \u2014 analyzing...');
                        handleImageUpload({ target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>);
                        return;
                      }
                    }
                  }
                }}
                placeholder={listening ? 'Listening\u2026 speak now' : 'Ask anything (paste images with Ctrl+V)...'}
                rows={1} disabled={loading}
                className={cn('w-full px-3 sm:px-4 py-2.5 rounded-xl text-[14px] text-foreground placeholder-muted-foreground outline-none border transition-colors resize-none',
                  listening ? 'border-red-400/40' : 'border-border focus:border-white/20'
                )} style={{ background: 'var(--color-surface-2)', minHeight: 42, maxHeight: 120 }} />
              {listening && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {[0,1,2].map(j => <div key={j} className="w-1 rounded-full bg-red-400" style={{ height: 12, animation: `cerebro-bounce 0.8s ease-in-out ${j * 0.15}s infinite` }} />)}
                </div>
              )}
            </div>
            <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
              className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all shrink-0', input.trim() ? 'btn-brand' : 'opacity-30 cursor-not-allowed')}
              style={{ background: 'var(--color-brand)' }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/40 mt-2">
            Cerebro can make mistakes. Verify important information.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes cerebro-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    }>
      <AgentPageInner />
    </Suspense>
  );
}
