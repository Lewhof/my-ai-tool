'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { CheckSquare, ClipboardList, StickyNote, Check } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent?: string;
}

export default function MessageList({ messages, streamingContent }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [actionDone, setActionDone] = useState<Record<string, string>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const quickAction = async (action: string, content: string, msgId: string) => {
    const truncated = content.replace(/[#*`>\-]/g, '').trim().slice(0, 100);

    try {
      if (action === 'task') {
        await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: truncated }),
        });
        setActionDone((prev) => ({ ...prev, [`${msgId}-task`]: 'Task created' }));
      } else if (action === 'whiteboard') {
        await fetch('/api/whiteboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: truncated, description: content }),
        });
        setActionDone((prev) => ({ ...prev, [`${msgId}-whiteboard`]: 'Added to whiteboard' }));
      } else if (action === 'note') {
        await fetch('/api/notes-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: truncated }),
        });
        // Update the note content
        const res = await fetch('/api/notes-v2');
        const data = await res.json();
        const latest = data.notes?.[0];
        if (latest) {
          await fetch(`/api/notes-v2/${latest.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          });
        }
        setActionDone((prev) => ({ ...prev, [`${msgId}-note`]: 'Saved as note' }));
      }
    } catch { /* silent */ }
  };

  if (messages.length === 0 && !streamingContent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Start a conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}
        >
          <div
            className={cn(
              'max-w-2xl px-4 py-3 rounded-lg',
              msg.role === 'user'
                ? 'bg-primary text-foreground'
                : 'bg-secondary text-foreground'
            )}
          >
            {msg.role === 'assistant' ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
            )}
          </div>

          {/* Quick actions for assistant messages */}
          {msg.role === 'assistant' && msg.content.length > 10 && (
            <div className="flex gap-1 mt-1 ml-1">
              {actionDone[`${msg.id}-task`] ? (
                <span className="text-green-400 text-xs flex items-center gap-1"><Check size={10} />{actionDone[`${msg.id}-task`]}</span>
              ) : (
                <button onClick={() => quickAction('task', msg.content, msg.id)} className="text-muted-foreground/60 hover:text-primary text-xs flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-card transition-colors">
                  <CheckSquare size={11} /> Task
                </button>
              )}
              {actionDone[`${msg.id}-whiteboard`] ? (
                <span className="text-green-400 text-xs flex items-center gap-1"><Check size={10} />{actionDone[`${msg.id}-whiteboard`]}</span>
              ) : (
                <button onClick={() => quickAction('whiteboard', msg.content, msg.id)} className="text-muted-foreground/60 hover:text-primary text-xs flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-card transition-colors">
                  <ClipboardList size={11} /> Whiteboard
                </button>
              )}
              {actionDone[`${msg.id}-note`] ? (
                <span className="text-green-400 text-xs flex items-center gap-1"><Check size={10} />{actionDone[`${msg.id}-note`]}</span>
              ) : (
                <button onClick={() => quickAction('note', msg.content, msg.id)} className="text-muted-foreground/60 hover:text-primary text-xs flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-card transition-colors">
                  <StickyNote size={11} /> Note
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {streamingContent && (
        <div className="flex justify-start">
          <div className="max-w-2xl px-4 py-3 rounded-lg bg-secondary text-foreground">
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
