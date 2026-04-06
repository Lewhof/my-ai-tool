'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { MessageSquare, FileText, Zap } from 'lucide-react';
import { formatRelativeDate, truncate } from '@/lib/utils';

interface DashboardData {
  recentChats: Array<{ id: string; title: string; updated_at: string }>;
  recentDocs: Array<{ id: string; name: string; file_type: string; created_at: string }>;
  recentRuns: Array<{ id: string; input: string; status: string; created_at: string }>;
  pendingTodos: Array<{ id: string; title: string; status: string; priority: string; due_date: string | null }>;
}

interface CreditsData {
  ai?: {
    totalCost: number;
    totalRequests: number;
    totalTokens: number;
    models: Record<string, { cost: number; requests: number }>;
    period: string;
    error?: string;
  };
  vercel?: { status?: string; error?: string };
  supabase?: { status: string; tier: string };
  clerk?: { status: string; tier: string };
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [notepad, setNotepad] = useState('');
  const [noteSaved, setNoteSaved] = useState(true);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/dashboard').then((r) => r.json()).then(setData);
    fetch('/api/notes').then((r) => r.json()).then((d) => setNotepad(d?.content ?? ''));
    fetch('/api/dashboard/credits').then((r) => r.json()).then(setCredits);
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* AI Credits Widget */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg">
        <div className="px-5 py-3 border-b border-gray-700">
          <h3 className="text-white font-semibold">AI Credits & Usage</h3>
          <p className="text-gray-500 text-xs mt-0.5">Last 30 days</p>
        </div>
        <div className="p-5">
          {!credits ? (
            <p className="text-gray-500 text-sm">Loading usage data...</p>
          ) : (
            <div className="space-y-5">
              {/* AI Usage Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">Total Spend</p>
                  <p className="text-white text-xl font-bold">
                    {credits.ai?.totalCost !== undefined ? formatCost(credits.ai.totalCost) : '--'}
                  </p>
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">API Requests</p>
                  <p className="text-white text-xl font-bold">
                    {credits.ai?.totalRequests ?? '--'}
                  </p>
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">Tokens Used</p>
                  <p className="text-white text-xl font-bold">
                    {credits.ai?.totalTokens !== undefined ? formatTokens(credits.ai.totalTokens) : '--'}
                  </p>
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">Avg Cost/Request</p>
                  <p className="text-white text-xl font-bold">
                    {credits.ai?.totalRequests
                      ? formatCost(credits.ai.totalCost / credits.ai.totalRequests)
                      : '--'}
                  </p>
                </div>
              </div>

              {/* Per-Model Breakdown */}
              {credits.ai?.models && Object.keys(credits.ai.models).length > 0 && (
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">By Model</p>
                  <div className="space-y-2">
                    {Object.entries(credits.ai.models)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([model, data]) => (
                        <div key={model} className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full ${
                              model.includes('haiku') ? 'bg-green-400' :
                              model.includes('sonnet') ? 'bg-blue-400' :
                              model.includes('opus') ? 'bg-purple-400' : 'bg-gray-400'
                            }`} />
                            <span className="text-white text-sm font-mono">{model}</span>
                          </div>
                          <div className="flex items-center gap-6">
                            <span className="text-gray-400 text-xs">{data.requests} req</span>
                            <span className="text-white text-sm font-medium">{formatCost(data.cost)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Service Status */}
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Services</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { name: 'Anthropic', status: credits.ai?.error ? 'error' : 'active', detail: credits.ai?.error || 'Via Helicone' },
                    { name: 'Vercel', status: credits.vercel?.error ? 'error' : 'active', detail: credits.vercel?.error || 'Pro' },
                    { name: 'Supabase', status: 'active', detail: credits.supabase?.tier || 'Free' },
                    { name: 'Clerk', status: 'active', detail: credits.clerk?.tier || 'Free' },
                  ].map((svc) => (
                    <div key={svc.name} className="bg-gray-900 rounded-lg px-3 py-2.5 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${svc.status === 'active' ? 'bg-green-400' : 'bg-red-400'}`} />
                      <div>
                        <p className="text-white text-xs font-medium">{svc.name}</p>
                        <p className="text-gray-500 text-xs">{svc.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/chat"
          className="bg-accent-600/15 hover:bg-accent-600/25 border border-accent-600/30 text-white rounded-lg p-4 flex items-center gap-3 transition-colors"
        >
          <MessageSquare size={20} className="text-accent-500" />
          <span className="text-sm font-medium">New Chat</span>
        </Link>
        <Link
          href="/documents"
          className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700 text-white rounded-lg p-4 flex items-center gap-3 transition-colors"
        >
          <FileText size={20} className="text-gray-400" />
          <span className="text-sm font-medium">Upload Document</span>
        </Link>
        <Link
          href="/workflows"
          className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700 text-white rounded-lg p-4 flex items-center gap-3 transition-colors"
        >
          <Zap size={20} className="text-gray-400" />
          <span className="text-sm font-medium">Run Workflow</span>
        </Link>
      </div>

      {/* Notepad Widget */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg">
        <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Notepad</h3>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${noteSaved ? 'bg-green-400' : 'bg-yellow-400'}`} />
            <span className="text-gray-500 text-xs">{noteSaved ? 'Saved' : 'Saving...'}</span>
          </div>
        </div>
        <textarea
          value={notepad}
          onChange={(e) => {
            setNotepad(e.target.value);
            setNoteSaved(false);
            if (noteTimer.current) clearTimeout(noteTimer.current);
            noteTimer.current = setTimeout(async () => {
              await fetch('/api/notes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: e.target.value }),
              });
              setNoteSaved(true);
            }, 1000);
          }}
          placeholder="Quick notes... (auto-saves)"
          className="w-full bg-transparent text-gray-300 px-5 py-4 text-sm focus:outline-none resize-none placeholder-gray-600"
          rows={4}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Chats */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Recent Chats</h3>
            <Link href="/chat" className="text-accent-400 text-sm hover:underline">View all</Link>
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
            <Link href="/documents" className="text-accent-400 text-sm hover:underline">View all</Link>
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

        {/* Pending To-Do */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg lg:col-span-2">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">To-Do</h3>
            <Link href="/todos" className="text-accent-400 text-sm hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-700">
            {!data || data.pendingTodos.length === 0 ? (
              <p className="text-gray-500 text-sm p-5">No pending tasks</p>
            ) : (
              data.pendingTodos.map((todo) => (
                <Link key={todo.id} href="/todos" className="flex items-center justify-between px-5 py-3 hover:bg-gray-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${todo.status === 'in-progress' ? 'bg-yellow-400' : 'bg-blue-400'}`} />
                    <span className="text-white text-sm">{todo.title}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    todo.priority === 'urgent' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                    todo.priority === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                    'bg-gray-700 text-gray-400 border-gray-600'
                  }`}>{todo.priority}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Workflow Runs */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg lg:col-span-2">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Recent Activity</h3>
            <Link href="/workflows" className="text-accent-400 text-sm hover:underline">View all</Link>
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
