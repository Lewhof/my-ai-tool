'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ThreadList from '@/components/chat/thread-list';
import ChatContainer from '@/components/chat/chat-container';
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

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handleNewChat = () => {
    router.push('/chat');
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/chat/threads/${id}`, { method: 'DELETE' });
    setThreads((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="flex flex-col sm:flex-row h-full min-h-0">
      <ThreadList threads={threads} onNewChat={handleNewChat} onDelete={handleDelete} loading={loading} />
      <div className="flex-1 min-w-0 min-h-0">
        <ChatContainer />
      </div>
    </div>
  );
}
