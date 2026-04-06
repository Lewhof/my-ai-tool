'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, formatRelativeDate } from '@/lib/utils';
import type { ChatThread } from '@/lib/types';

interface ThreadListProps {
  threads: ChatThread[];
  onNewChat: () => void;
  onDelete: (id: string) => void;
}

export default function ThreadList({ threads, onNewChat, onDelete }: ThreadListProps) {
  const pathname = usePathname();

  return (
    <div className="w-72 border-r border-gray-700 flex flex-col h-full">
      <div className="p-3 border-b border-gray-700">
        <button
          onClick={onNewChat}
          className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          + New Chat
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {threads.length === 0 ? (
          <p className="text-gray-500 text-center p-4 text-sm">No conversations yet</p>
        ) : (
          threads.map((thread) => {
            const isActive = pathname === `/chat/${thread.id}`;
            return (
              <div
                key={thread.id}
                className={cn(
                  'group flex items-center border-b border-gray-800',
                  isActive ? 'bg-gray-700' : 'hover:bg-gray-800'
                )}
              >
                <Link
                  href={`/chat/${thread.id}`}
                  className="flex-1 px-4 py-3 min-w-0"
                >
                  <p className="text-white text-sm font-medium truncate">{thread.title}</p>
                  <p className="text-gray-500 text-xs">{formatRelativeDate(thread.updated_at)}</p>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete(thread.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 px-3 text-gray-500 hover:text-red-400 transition-opacity"
                  title="Delete"
                >
                  x
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
