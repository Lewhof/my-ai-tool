'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import {
  Send, Loader2, Bot, User, Sparkles, Mic, MicOff, Camera,
  Calendar, CheckSquare, ClipboardList, FileText,
  StickyNote, Cloud, CreditCard, BookOpen, Search,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_PROMPTS = [
  { icon: Calendar, text: "What's on my calendar today?", color: 'text-blue-400' },
  { icon: CheckSquare, text: 'Show me my pending tasks', color: 'text-green-400' },
  { icon: ClipboardList, text: 'What items are on my whiteboard?', color: 'text-accent-400' },
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

    // Upload to notes storage for a URL
    const formData = new FormData();
    formData.append('file', file);
    const uploadRes = await fetch('/api/notes-v2/upload', { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();

    if (uploadData.url) {
      const msg = `I'm sharing an image with you: ${uploadData.url}\n\nPlease analyze this image and tell me what you see.`;
      sendMessage(msg);
    }
    e.target.value = '';
  };

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
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
      <div className="px-6 py-3 border-b border-gray-700 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-accent-600 flex items-center justify-center">
          <Bot size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-white font-semibold text-sm">Cerebro</h2>
          <p className="text-gray-500 text-xs">Claude Sonnet with access to all your tools</p>
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
              className="text-gray-500 hover:text-accent-400 text-xs px-3 py-1.5 border border-gray-700 rounded-lg transition-colors"
            >
              Archive & Clear
            </button>
            <button
              onClick={async () => {
                if (!confirm('Clear conversation history? This cannot be undone.')) return;
                await fetch('/api/agent/history', { method: 'DELETE' });
                setMessages([]);
              }}
              className="text-gray-500 hover:text-red-400 text-xs px-3 py-1.5 border border-gray-700 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <Sparkles size={32} className="mx-auto text-accent-500 mb-3" />
              <h3 className="text-white text-lg font-semibold mb-1">What can I help you with?</h3>
              <p className="text-gray-500 text-sm max-w-md">I can access your calendar, tasks, documents, notes, whiteboard, and more. Just ask.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {SUGGESTED_PROMPTS.map((prompt) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.text}
                    onClick={() => sendMessage(prompt.text)}
                    className="flex items-center gap-3 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors text-left"
                  >
                    <Icon size={16} className={prompt.color} />
                    <span className="text-gray-300 text-sm">{prompt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-accent-600/20 flex items-center justify-center shrink-0 mt-1">
                  <Bot size={14} className="text-accent-400" />
                </div>
              )}
              <div className={cn(
                'max-w-2xl rounded-lg px-4 py-3',
                msg.role === 'user'
                  ? 'bg-accent-600 text-white'
                  : 'bg-gray-800 border border-gray-700'
              )}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center shrink-0 mt-1">
                  <User size={14} className="text-gray-400" />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-accent-600/20 flex items-center justify-center shrink-0">
              <Loader2 size={14} className="text-accent-400 animate-spin" />
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
              <p className="text-gray-400 text-sm">Thinking and using tools...</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-3 sm:p-4 shrink-0">
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
        <div className="flex gap-2 max-w-3xl mx-auto">
          {/* Voice button */}
          <button
            onClick={toggleVoice}
            className={cn(
              'p-3 rounded-lg transition-colors self-end shrink-0',
              listening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
            )}
            title={listening ? 'Stop listening' : 'Voice input'}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          {/* Camera button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-lg bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors self-end shrink-0"
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
            className="flex-1 bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600 resize-none placeholder-gray-500"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="bg-accent-600 text-white p-3 rounded-lg hover:bg-accent-700 transition-colors disabled:opacity-30 self-end"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
