'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ThreadList from '@/components/chat/thread-list';
import ChatContainer from '@/components/chat/chat-container';
import type { ChatThread } from '@/lib/types';

export default function ChatPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[]>([]);

  const fetchThreads = useCallback(async () => {
    const res = await fetch('/api/chat/threads');
    const data = await res.json();
    setThreads(data.threads ?? []);
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handleNewChat = () => {
    // Start a new chat without a threadId — it'll be created on first message
    router.push('/chat');
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/chat/threads/${id}`, { method: 'DELETE' });
    setThreads((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="flex h-full">
      <ThreadList threads={threads} onNewChat={handleNewChat} onDelete={handleDelete} />
      <div className="flex-1">
        <ChatContainer />
      </div>
    </div>
  );
}
