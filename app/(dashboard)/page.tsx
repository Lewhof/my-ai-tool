'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeDate, truncate } from '@/lib/utils';

interface DashboardData {
  recentChats: Array<{ id: string; title: string; updated_at: string }>;
  recentDocs: Array<{ id: string; name: string; file_type: string; created_at: string }>;
  recentRuns: Array<{ id: string; input: string; status: string; created_at: string }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/chat"
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg p-5 text-center transition-colors"
        >
          <p className="text-2xl mb-1">{'\u{1F4AC}'}</p>
          <p className="font-medium">New Chat</p>
        </Link>
        <Link
          href="/documents"
          className="bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 rounded-lg p-5 text-center transition-colors"
        >
          <p className="text-2xl mb-1">{'\u{1F4C4}'}</p>
          <p className="font-medium">Upload Document</p>
        </Link>
        <Link
          href="/workflows"
          className="bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 rounded-lg p-5 text-center transition-colors"
        >
          <p className="text-2xl mb-1">{'\u{26A1}'}</p>
          <p className="font-medium">Run Workflow</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Chats */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Recent Chats</h3>
            <Link href="/chat" className="text-indigo-400 text-sm hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-700">
            {!data || data.recentChats.length === 0 ? (
              <p className="text-gray-500 text-sm p-5">No chats yet</p>
            ) : (
              data.recentChats.map((chat) => (
                <Link key={chat.id} href={`/chat/${chat.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-700 transition-colors">
                  <span className="text-white text-sm truncate mr-4">{chat.title}</span>
                  <span className="text-gray-500 text-xs whitespace-nowrap">{formatRelativeDate(chat.updated_at)}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Documents */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Recent Documents</h3>
            <Link href="/documents" className="text-indigo-400 text-sm hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-700">
            {!data || data.recentDocs.length === 0 ? (
              <p className="text-gray-500 text-sm p-5">No documents yet</p>
            ) : (
              data.recentDocs.map((doc) => (
                <Link key={doc.id} href={`/documents/${doc.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-700 transition-colors">
                  <span className="text-white text-sm truncate mr-4">{doc.name}</span>
                  <span className="text-gray-500 text-xs whitespace-nowrap">{formatRelativeDate(doc.created_at)}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Workflow Runs */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg lg:col-span-2">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Recent Activity</h3>
            <Link href="/workflows" className="text-indigo-400 text-sm hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-700">
            {!data || data.recentRuns.length === 0 ? (
              <p className="text-gray-500 text-sm p-5">No workflow runs yet</p>
            ) : (
              data.recentRuns.map((run) => (
                <div key={run.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${run.status === 'completed' ? 'bg-green-400' : run.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                    <span className="text-white text-sm">{truncate(run.input, 60)}</span>
                  </div>
                  <span className="text-gray-500 text-xs whitespace-nowrap">{formatRelativeDate(run.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
