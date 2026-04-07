'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ThreadList from '@/components/chat/thread-list';
import { MessageSquare } from 'lucide-react';
import type { ChatThread } from '@/lib/types';

export default function ChatPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

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

  const handleDelete = async (id: string) => {
    await fetch(`/api/chat/threads/${id}`, { method: 'DELETE' });
    setThreads((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="flex flex-col sm:flex-row h-full min-h-0">
      <ThreadList threads={threads} onNewChat={handleNewChat} onDelete={handleDelete} loading={loading} />
      <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare size={32} className="mx-auto text-muted-foreground/60 mb-3" />
          <p className="text-muted-foreground text-sm">Select a conversation or start a new one</p>
        </div>
      </div>
    </div>
  );
}
