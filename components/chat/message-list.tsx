'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent?: string;
}

export default function MessageList({ messages, streamingContent }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  if (messages.length === 0 && !streamingContent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Start a conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
        >
          <div
            className={cn(
              'max-w-2xl px-4 py-3 rounded-lg',
              msg.role === 'user'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-700 text-gray-100'
            )}
          >
            {msg.role === 'assistant' ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            )}
          </div>
        </div>
      ))}
      {streamingContent && (
        <div className="flex justify-start">
          <div className="max-w-2xl px-4 py-3 rounded-lg bg-gray-700 text-gray-100">
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{streamingContent}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
