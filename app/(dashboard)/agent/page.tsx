'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import {
  Send, Loader2, Bot, User, Sparkles, Mic, MicOff, Camera, X,
  Calendar, CheckSquare, ClipboardList, FileText,
  StickyNote, Cloud, CreditCard, BookOpen, Search,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SLASH_COMMANDS = [
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
  { icon: Calendar, text: "What's on my calendar today?", color: 'text-blue-400' },
  { icon: CheckSquare, text: 'Show me my pending tasks', color: 'text-green-400' },
  { icon: ClipboardList, text: 'What items are on my whiteboard?', color: 'text-primary' },
  { icon: FileText, text: 'Search my documents for contracts', color: 'text-purple-400' },
  { icon: Cloud, text: "What's the weather like?", color: 'text-cyan-400' },
  { icon: CreditCard, text: 'How much have I spent on AI this month?', color: 'text-yellow-400' },
  { icon: StickyNote, text: 'Create a note with my meeting recap', color: 'text-orange-400' },
  { icon: Search, text: 'Search the web for latest Next.js features', color: 'text-pink-400' },
];

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [replyTo, setReplyTo] = useState<{ index: number; content: string; role: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load conversation history on mount
  useEffect(() => {
    fetch('/api/agent/history')
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length) {
          setMessages(data.messages.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })));
        }
      })
      .catch(() => { /* no history yet */ });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Voice input
  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input not supported in this browser.');
      return;
    }

    const recognition = new (SpeechRecognition as new () => SpeechRecognition)();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('');
      setInput(transcript);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  // Camera/image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: '📷 [Photo uploaded for analysis]' }]);

    try {
      // Send image to Gemini Vision for analysis
      const formData = new FormData();
      formData.append('file', file);
      formData.append('prompt', input.trim() || 'Analyze this image in detail. Describe what you see.');

      const res = await fetch('/api/agent/vision', { method: 'POST', body: formData });
      const data = await res.json();

      setMessages((prev) => [...prev, { role: 'assistant', content: data.analysis || data.error || 'Could not analyze image.' }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error analyzing image. Please try again.' }]);
    } finally {
      setLoading(false);
      setInput('');
    }
    e.target.value = '';
  };

  // Slash command handler
  const processSlashCommand = (msg: string): string => {
    if (msg.startsWith('/task ')) return `Create a task: "${msg.slice(6)}"`;
    if (msg.startsWith('/note ')) return `Save a note titled "${msg.slice(6)}" with relevant content`;
    if (msg.startsWith('/image ')) return `Generate an image: ${msg.slice(7)}`;
    if (msg.startsWith('/search ')) return `Search the web for: ${msg.slice(8)}`;
    if (msg.startsWith('/whiteboard ')) return `Add to whiteboard: "${msg.slice(12)}"`;
    if (msg.startsWith('/kb ')) return `Search the knowledge base for: ${msg.slice(4)}`;
    if (msg.startsWith('/calendar')) return 'Show me my calendar events for today and tomorrow';
    if (msg.startsWith('/weather')) return "What's the current weather?";
    if (msg.startsWith('/credits')) return 'Show me my AI usage and credits';
    if (msg.startsWith('/todos')) return 'Show me my pending tasks';
    if (msg.startsWith('/email')) return 'Show me my recent unread emails';
    return msg;
  };

  const sendMessage = async (text?: string) => {
    const rawMsg = text || input.trim();
    if (!rawMsg || loading) return;

    const msg = processSlashCommand(rawMsg);

    // Build message with quote if replying
    const fullMsg = replyTo
      ? `> Replying to: "${replyTo.content.slice(0, 150)}${replyTo.content.length > 150 ? '...' : ''}"\n\n${msg}`
      : msg;

    setInput('');
    setReplyTo(null);
    setMessages((prev) => [...prev, { role: 'user', content: fullMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullMsg,
          history: messages.slice(-20),
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => 'Agent error');
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err}` }]);
        return;
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response || 'No response.' }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Network error'}` }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Bot size={18} className="text-foreground" />
        </div>
        <div>
          <h2 className="text-foreground font-semibold text-sm">Cerebro</h2>
          <p className="text-muted-foreground text-xs">Claude Sonnet with access to all your tools</p>
        </div>
        {messages.length > 0 && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={async () => {
                const content = messages.map((m) => `**${m.role === 'user' ? 'You' : 'Cerebro'}:**\n${m.content}`).join('\n\n---\n\n');
                const title = `Cerebro Archive — ${new Date().toLocaleDateString('en-ZA')}`;
                await fetch('/api/kb', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title, content, category: 'Reference', tags: ['cerebro', 'archive'] }),
                });
                await fetch('/api/agent/history', { method: 'DELETE' });
                setMessages([]);
                alert('Conversation archived to Knowledge Base');
              }}
              className="text-muted-foreground hover:text-primary text-xs px-3 py-1.5 border border-border rounded-lg transition-colors"
            >
              Archive & Clear
            </button>
            <button
              onClick={async () => {
                if (!confirm('Clear conversation history? This cannot be undone.')) return;
                await fetch('/api/agent/history', { method: 'DELETE' });
                setMessages([]);
              }}
              className="text-muted-foreground hover:text-red-400 text-xs px-3 py-1.5 border border-border rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-auto px-6 py-4 space-y-4"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          if (file.type.startsWith('image/')) {
            // Send to vision analysis
            const fakeEvent = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
            handleImageUpload(fakeEvent);
          } else {
            // Upload doc and ask to analyze
            setLoading(true);
            setMessages((prev) => [...prev, { role: 'user', content: `📎 [File uploaded: ${file.name}]` }]);
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch('/api/documents', { method: 'POST', body: formData });
            if (uploadRes.ok) {
              const doc = await uploadRes.json();
              sendMessage(`I just uploaded a document called "${file.name}". Can you analyze it? Document ID: ${doc.id}`);
            } else {
              setMessages((prev) => [...prev, { role: 'assistant', content: 'Failed to upload file. Please try again.' }]);
              setLoading(false);
            }
          }
        }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <Sparkles size={32} className="mx-auto text-primary mb-3" />
              <h3 className="text-foreground text-lg font-semibold mb-1">What can I help you with?</h3>
              <p className="text-muted-foreground text-sm max-w-md">I can access your calendar, tasks, documents, notes, whiteboard, and more. Just ask.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {SUGGESTED_PROMPTS.map((prompt) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.text}
                    onClick={() => sendMessage(prompt.text)}
                    className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg hover:border-border transition-colors text-left"
                  >
                    <Icon size={16} className={prompt.color} />
                    <span className="text-foreground text-sm">{prompt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-3 group', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                  <Bot size={14} className="text-primary" />
                </div>
              )}
              <div className={cn(
                'max-w-2xl rounded-lg px-4 py-3',
                msg.role === 'user'
                  ? 'bg-primary text-foreground'
                  : 'bg-card border border-border'
              )}>
                {msg.role === 'assistant' ? (
                  <div>
                    {/* Render images if present */}
                    {msg.content.includes('IMAGE_GENERATED:') && (() => {
                      const match = msg.content.match(/IMAGE_GENERATED:(https?:\/\/[^\s\n]+)/);
                      const imageUrl = match?.[1];
                      const textContent = msg.content.replace(/IMAGE_GENERATED:https?:\/\/[^\s\n]+\n*/, '').trim();
                      return (
                        <>
                          {imageUrl && (
                            <div className="mb-3">
                              <img src={imageUrl} alt="Generated image" className="max-w-full rounded-lg border border-border" />
                              <a href={imageUrl} target="_blank" download className="text-primary text-xs hover:underline mt-1 inline-block">Download image</a>
                            </div>
                          )}
                          {textContent && (
                            <div className="prose prose-invert prose-sm max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {!msg.content.includes('IMAGE_GENERATED:') && (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
                {/* Forward actions for assistant messages */}
                {msg.role === 'assistant' && msg.content.length > 10 && (
                  <div className="flex gap-1 mt-2 pt-2 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
                    {[
                      { label: 'Task', action: async () => { await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: msg.content.replace(/[#*`>\-]/g, '').trim().slice(0, 100) }) }); } },
                      { label: 'Note', action: async () => { await fetch('/api/notes-v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Cerebro Note' }) }).then((r) => r.json()).then(async (n) => { if (n.id) await fetch(`/api/notes-v2/${n.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: msg.content }) }); }); } },
                      { label: 'KB', action: async () => { await fetch('/api/kb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `Cerebro — ${new Date().toLocaleDateString()}`, content: msg.content, category: 'Reference', tags: ['cerebro'] }) }); } },
                      { label: 'Board', action: async () => { await fetch('/api/whiteboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: msg.content.replace(/[#*`>\-]/g, '').trim().slice(0, 80), description: msg.content }) }); } },
                    ].map((fwd) => (
                      <button key={fwd.label} onClick={async () => { await fwd.action(); alert(`Saved to ${fwd.label}`); }} className="text-muted-foreground/60 hover:text-primary text-[10px] px-1.5 py-0.5 rounded hover:bg-secondary/50 transition-colors">
                        → {fwd.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Reply button */}
              <button
                onClick={() => setReplyTo({ index: i, content: msg.content, role: msg.role })}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-primary p-1 self-start mt-1 transition-opacity shrink-0"
                title="Reply"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17H4V12"/><path d="M4 17L13 8C14.66 6.34 17.34 6.34 19 8C20.66 9.66 20.66 12.34 19 14L15 18"/></svg>
              </button>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-1">
                  <User size={14} className="text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Loader2 size={14} className="text-primary animate-spin" />
            </div>
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <p className="text-muted-foreground text-sm">Thinking and using tools...</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {/* Slash command autocomplete */}
      {input.startsWith('/') && !loading && (
        <div className="px-4 py-2 border-t border-border bg-card shrink-0 max-h-48 overflow-auto">
          {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.split(' ')[0])).map((cmd) => (
            <button
              key={cmd.cmd}
              onClick={() => setInput(cmd.cmd + ' ')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-secondary transition-colors text-left"
            >
              <div>
                <span className="text-primary text-sm font-mono">{cmd.cmd}</span>
                <span className="text-muted-foreground text-xs ml-2">{cmd.desc}</span>
              </div>
              <span className="text-muted-foreground/60 text-xs">{cmd.example}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 py-2 bg-card border-t border-border flex items-start gap-2 shrink-0">
          <div className="border-l-2 border-primary pl-3 flex-1 min-w-0">
            <p className="text-primary text-xs font-medium mb-0.5">
              Replying to {replyTo.role === 'user' ? 'yourself' : 'Cerebro'}
            </p>
            <p className="text-muted-foreground text-xs truncate">{replyTo.content.slice(0, 100)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0 p-1">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="border-t border-border p-3 sm:p-4 shrink-0">
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
        <div className="flex gap-2 max-w-3xl mx-auto">
          {/* Voice button */}
          <button
            onClick={toggleVoice}
            className={cn(
              'p-3 rounded-lg transition-colors self-end shrink-0',
              listening ? 'bg-red-500 text-foreground animate-pulse' : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            )}
            title={listening ? 'Stop listening' : 'Voice input'}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          {/* Camera button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-lg bg-card text-muted-foreground hover:text-foreground border border-border transition-colors self-end shrink-0"
            title="Upload image / Take photo"
          >
            <Camera size={18} />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={listening ? 'Listening...' : 'Ask anything — voice, camera, or type...'}
            rows={1}
            className="flex-1 bg-card text-foreground border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none placeholder-muted-foreground"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="bg-primary text-foreground p-3 rounded-lg hover:bg-primary transition-colors disabled:opacity-30 self-end"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
