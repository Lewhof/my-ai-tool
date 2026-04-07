'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, formatRelativeDate } from '@/lib/utils';
import { Plus, Trash2, ChevronDown, Zap, Brain, Rocket, Search, Sparkles } from 'lucide-react';
import type { ChatThread } from '@/lib/types';

const AI_PROVIDERS = [
  { id: 'claude-haiku', name: 'Claude Haiku', description: 'Fast & cheap', icon: Zap, color: 'text-green-400', bg: 'bg-green-500/10' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', description: 'Smart & capable', icon: Brain, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'groq-llama', name: 'Groq LLaMA 3', description: 'Instant responses', icon: Rocket, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'gemini', name: 'Gemini Flash', description: 'Google AI — free', icon: Sparkles, color: 'text-blue-300', bg: 'bg-blue-400/10' },
  { id: 'perplexity', name: 'Perplexity', description: 'Web search', icon: Search, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
];

interface ThreadListProps {
  threads: ChatThread[];
  onNewChat: (model: string) => void;
  onDelete: (id: string) => void;
  loading?: boolean;
}

export default function ThreadList({ threads, onNewChat, onDelete, loading }: ThreadListProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    AI_PROVIDERS.forEach((p) => { init[p.id] = true; });
    return init;
  });
  const [showPicker, setShowPicker] = useState(false);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this conversation?')) onDelete(id);
  };

  // Group threads by model
  const threadsByModel: Record<string, ChatThread[]> = {};
  for (const thread of threads) {
    const model = thread.model || 'claude-haiku';
    if (!threadsByModel[model]) threadsByModel[model] = [];
    threadsByModel[model].push(thread);
  }

  return (
    <div className="w-full sm:w-72 border-b sm:border-b-0 sm:border-r border-gray-700 flex flex-col shrink-0 max-h-60 sm:max-h-none sm:h-full">
      {/* New Chat button */}
      <div className="p-3 border-b border-gray-700">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="w-full bg-accent-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-accent-700 transition-colors text-sm flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      {/* Model picker */}
      {showPicker && (
        <div className="border-b border-gray-700 bg-gray-900/50">
          <p className="px-4 py-2 text-gray-500 text-xs font-semibold uppercase tracking-wider">Choose AI</p>
          {AI_PROVIDERS.map((provider) => {
            const Icon = provider.icon;
            return (
              <button
                key={provider.id}
                onClick={() => { onNewChat(provider.id); setShowPicker(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left"
              >
                <Icon size={16} className={provider.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{provider.name}</p>
                  <p className="text-gray-500 text-xs">{provider.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Grouped thread list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-gray-500 text-center p-4 text-sm">Loading...</p>
        ) : threads.length === 0 ? (
          <p className="text-gray-500 text-center p-4 text-sm">No conversations yet</p>
        ) : (
          AI_PROVIDERS.map((provider) => {
            const providerThreads = threadsByModel[provider.id] ?? [];
            if (providerThreads.length === 0) return null;

            const Icon = provider.icon;
            const isExpanded = expanded[provider.id] ?? true;

            return (
              <div key={provider.id}>
                {/* Provider header */}
                <button
                  onClick={() => toggleExpand(provider.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-2 text-left transition-colors border-b border-gray-800',
                    provider.bg
                  )}
                >
                  <Icon size={14} className={provider.color} />
                  <span className={cn('text-xs font-semibold flex-1', provider.color)}>{provider.name}</span>
                  <span className="text-gray-500 text-xs">{providerThreads.length}</span>
                  <ChevronDown size={12} className={cn('text-gray-500 transition-transform', !isExpanded && '-rotate-90')} />
                </button>

                {/* Threads */}
                {isExpanded && providerThreads.map((thread) => {
                  const isActive = pathname === `/chat/${thread.id}`;
                  return (
                    <div
                      key={thread.id}
                      className={cn(
                        'group flex items-center border-b border-gray-800',
                        isActive ? 'bg-gray-700' : 'hover:bg-gray-800'
                      )}
                    >
                      <Link href={`/chat/${thread.id}`} className="flex-1 pl-9 pr-4 py-2.5 min-w-0">
                        <p className="text-white text-sm truncate">{thread.title}</p>
                        <p className="text-gray-500 text-xs">{formatRelativeDate(thread.updated_at)}</p>
                      </Link>
                      <button
                        onClick={(e) => handleDelete(e, thread.id)}
                        className="opacity-0 group-hover:opacity-100 px-3 text-gray-500 hover:text-red-400 transition-opacity"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
