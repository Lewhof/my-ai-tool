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
      <ThreadList threads={threads} onNewChat={handleNewChat} onDelete={handleDelete} loading={loading} />
      <div className="flex-1 min-w-0 min-h-0">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">Loading messages...</p>
          </div>
        ) : (
          <ChatContainer threadId={id} initialMessages={messages} initialModel={threadModel} />
        )}
      </div>
    </div>
  );
}
