'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import ThreadList from '@/components/chat/thread-list';
import ChatContainer from '@/components/chat/chat-container';
import type { ChatThread, ChatMessage } from '@/lib/types';

export default function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const fetchThreads = useCallback(async () => {
    const res = await fetch('/api/chat/threads');
    const data = await res.json();
    setThreads(data.threads ?? []);
  }, []);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/chat/threads/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages ?? []);
  }, [id]);

  useEffect(() => {
    fetchThreads();
    fetchMessages();
  }, [fetchThreads, fetchMessages]);

  const handleNewChat = () => {
    router.push('/chat');
  };

  const handleDelete = async (threadId: string) => {
    await fetch(`/api/chat/threads/${threadId}`, { method: 'DELETE' });
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (threadId === id) router.push('/chat');
  };

  return (
    <div className="flex flex-col sm:flex-row h-full min-h-0">
      <ThreadList threads={threads} onNewChat={handleNewChat} onDelete={handleDelete} />
      <div className="flex-1 min-w-0 min-h-0">
        <ChatContainer threadId={id} initialMessages={messages} />
      </div>
    </div>
  );
}
