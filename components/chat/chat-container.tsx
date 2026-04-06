'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MessageList from './message-list';
import ChatInput from './chat-input';
import type { ChatMessage } from '@/lib/types';

interface ChatContainerProps {
  threadId?: string;
  initialMessages?: ChatMessage[];
  apiEndpoint?: string;
}

export default function ChatContainer({
  threadId,
  initialMessages = [],
  apiEndpoint = '/api/chat',
}: ChatContainerProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const sendMessage = useCallback(
    async (message: string) => {
      // Optimistically add user message
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        thread_id: threadId ?? '',
        role: 'user',
        content: message,
        model: null,
        tokens_used: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingContent('');

      try {
        const res = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId, message }),
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        // Check if we got a new thread ID
        const newThreadId = res.headers.get('X-Thread-Id');
        if (newThreadId && !threadId) {
          router.push(`/chat/${newThreadId}`);
        }

        // Read the stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setStreamingContent(accumulated);
        }

        // Add assistant message to list
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          thread_id: newThreadId ?? threadId ?? '',
          role: 'assistant',
          content: accumulated,
          model: null,
          tokens_used: null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingContent('');
      } catch (err) {
        setStreamingContent('');
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          thread_id: threadId ?? '',
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
          model: null,
          tokens_used: null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsStreaming(false);
      }
    },
    [threadId, apiEndpoint, router]
  );

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} streamingContent={streamingContent || undefined} />
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
