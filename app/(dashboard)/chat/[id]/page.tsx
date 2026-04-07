'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import ThreadList from '@/components/chat/thread-list';
import ChatContainer from '@/components/chat/chat-container';
import { Zap, Brain, Rocket, Search, Sparkles } from 'lucide-react';
import type { ChatThread, ChatMessage } from '@/lib/types';

const MODEL_INFO: Record<string, { name: string; icon: typeof Zap; color: string }> = {
  'claude-haiku': { name: 'Claude Haiku', icon: Zap, color: 'text-green-400' },
  'claude-sonnet': { name: 'Claude Sonnet', icon: Brain, color: 'text-blue-400' },
  'groq-llama': { name: 'Groq LLaMA 3', icon: Rocket, color: 'text-orange-400' },
  'gemini': { name: 'Gemini Flash', icon: Sparkles, color: 'text-blue-300' },
  'perplexity': { name: 'Perplexity', icon: Search, color: 'text-cyan-400' },
};

export default function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadModel, setThreadModel] = useState('claude-haiku');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/threads');
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  const fetchMessages = useCallback(async () => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/chat/threads/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        if (data.thread?.model) setThreadModel(data.thread.model);
      }
    } catch { /* silent */ }
    finally { setMessagesLoading(false); }
  }, [id]);

  useEffect(() => {
    fetchThreads();
    fetchMessages();
  }, [fetchThreads, fetchMessages]);

  const handleNewChat = async (model: string) => {
    const res = await fetch('/api/chat/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Chat', model }),
    });
    const data = await res.json();
    if (data.id) {
      fetchThreads();
      router.push(`/chat/${data.id}`);
    }
  };

  const handleDelete = async (threadId: string) => {
    await fetch(`/api/chat/threads/${threadId}`, { method: 'DELETE' });
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (threadId === id) router.push('/chat');
  };

  const info = MODEL_INFO[threadModel] || MODEL_INFO['claude-haiku'];
  const ModelIcon = info.icon;

  return (
    <div className="flex flex-col sm:flex-row h-full min-h-0">
      <ThreadList threads={threads} onNewChat={handleNewChat} onDelete={handleDelete} loading={loading} />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Model badge header */}
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0">
          <ModelIcon size={14} className={info.color} />
          <span className={`text-sm font-medium ${info.color}`}>{info.name}</span>
        </div>

        {messagesLoading ? (
          <div className="flex items-center justify-center flex-1">
            <p className="text-muted-foreground text-sm">Loading messages...</p>
          </div>
        ) : (
          <ChatContainer threadId={id} initialMessages={messages} initialModel={threadModel} showModelSelector={false} />
        )}
      </div>
    </div>
  );
}
