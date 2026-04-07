'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import MessageList from './message-list';
import ChatInput from './chat-input';
import type { ChatMessage } from '@/lib/types';

interface ChatContainerProps {
  threadId?: string;
  initialMessages?: ChatMessage[];
  initialModel?: string;
  apiEndpoint?: string;
  showModelSelector?: boolean;
}

export default function ChatContainer({
  threadId,
  initialMessages = [],
  initialModel = 'claude-haiku',
  apiEndpoint = '/api/chat',
}: ChatContainerProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Cleanup on unmount — abort any active stream
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      if (isStreaming) return;
      if (!threadId) return; // Don't send without a thread
      setError(null);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        thread_id: threadId,
        role: 'user',
        content: message,
        model: null,
        tokens_used: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingContent('');

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId, message, model: initialModel }),
          signal: abort.signal,
        });

        if (!res.ok) {
          const errData = await res.text().catch(() => 'Unknown error');
          throw new Error(`API error ${res.status}: ${errData}`);
        }

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
        accumulated += decoder.decode(undefined, { stream: false });

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          thread_id: threadId,
          role: 'assistant',
          content: accumulated,
          model: initialModel,
          tokens_used: null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingContent('');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // Navigated away
        setStreamingContent('');
        setError(err instanceof Error ? err.message : 'Something went wrong');
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          thread_id: threadId,
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Something went wrong. Please try again.'}`,
          model: null,
          tokens_used: null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [threadId, apiEndpoint, isStreaming, initialModel]
  );

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} streamingContent={streamingContent || undefined} />
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
      <ChatInput onSend={sendMessage} disabled={isStreaming || !threadId} />
    </div>
  );
}
