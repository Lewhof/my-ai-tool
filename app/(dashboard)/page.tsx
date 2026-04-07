'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MessageSquare, FileText, Zap, Lock, Unlock, RotateCcw, Plus } from 'lucide-react';
import { formatRelativeDate, truncate } from '@/lib/utils';
import WeatherWidget from '@/components/dashboard/weather-widget';
import CalendarWidget from '@/components/dashboard/calendar-widget';
import BriefingWidget from '@/components/dashboard/briefing-widget';
import type { Layout } from 'react-grid-layout';

const ResponsiveGridLayout = dynamic(
  () => import('react-grid-layout').then((mod) => mod.WidthProvider(mod.Responsive)),
  { ssr: false }
);

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

const DEFAULT_LAYOUTS: Record<string, Layout[]> = {
  lg: [
    { i: 'quick-actions', x: 0, y: 0, w: 12, h: 2, isResizable: false },
    { i: 'briefing', x: 0, y: 2, w: 8, h: 8 },
    { i: 'credits', x: 8, y: 10, w: 4, h: 7 },
    { i: 'weather', x: 8, y: 2, w: 4, h: 7 },
    { i: 'notepad', x: 0, y: 9, w: 4, h: 5 },
    { i: 'chats', x: 4, y: 9, w: 4, h: 5 },
    { i: 'docs', x: 8, y: 9, w: 4, h: 5 },
    { i: 'calendar', x: 0, y: 14, w: 4, h: 7 },
    { i: 'todos', x: 4, y: 14, w: 4, h: 5 },
    { i: 'activity', x: 8, y: 14, w: 4, h: 5 },
  ],
  md: [
    { i: 'quick-actions', x: 0, y: 0, w: 10, h: 2, isResizable: false },
    { i: 'credits', x: 0, y: 2, w: 6, h: 7 },
    { i: 'weather', x: 6, y: 2, w: 4, h: 7 },
    { i: 'notepad', x: 0, y: 9, w: 5, h: 5 },
    { i: 'chats', x: 5, y: 9, w: 5, h: 5 },
    { i: 'docs', x: 0, y: 14, w: 5, h: 5 },
    { i: 'calendar', x: 5, y: 14, w: 5, h: 7 },
    { i: 'todos', x: 0, y: 19, w: 5, h: 5 },
    { i: 'activity', x: 5, y: 21, w: 5, h: 5 },
  ],
  sm: [
    { i: 'quick-actions', x: 0, y: 0, w: 6, h: 3, isResizable: false },
    { i: 'briefing', x: 0, y: 3, w: 6, h: 8 },
    { i: 'weather', x: 0, y: 11, w: 6, h: 7 },
    { i: 'notepad', x: 0, y: 18, w: 6, h: 5 },
    { i: 'todos', x: 0, y: 23, w: 6, h: 5 },
    { i: 'chats', x: 0, y: 28, w: 6, h: 5 },
    { i: 'docs', x: 0, y: 33, w: 6, h: 5 },
    { i: 'calendar', x: 0, y: 38, w: 6, h: 7 },
    { i: 'credits', x: 0, y: 45, w: 6, h: 7 },
    { i: 'activity', x: 0, y: 52, w: 6, h: 5 },
  ],
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [notepad, setNotepad] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(true);
  const [locked, setLocked] = useState(true);
  const [layouts, setLayouts] = useState<Record<string, Layout[]>>(DEFAULT_LAYOUTS);
  const [newTodo, setNewTodo] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDashboard = useCallback(() => {
    fetch('/api/dashboard').then((r) => r.json()).then(setData);
  }, []);

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTodo }),
    });
    setNewTodo('');
    setAddingTodo(false);
    fetchDashboard();
  };

  useEffect(() => {
    fetchDashboard();
    fetch('/api/notes').then((r) => r.json()).then((d) => { setNotepad(d?.content ?? ''); setNoteId(d?.id ?? null); });
    fetch('/api/dashboard/credits').then((r) => r.json()).then(setCredits);

    // Load saved layout
    const saved = localStorage.getItem('dashboard_layouts');
    if (saved) {
      try { setLayouts(JSON.parse(saved)); } catch { /* use default */ }
    }
  }, []);

  const onLayoutChange = useCallback((_: Layout[], allLayouts: Record<string, Layout[]>) => {
    setLayouts(allLayouts);
    localStorage.setItem('dashboard_layouts', JSON.stringify(allLayouts));
  }, []);

  const resetLayout = () => {
    setLayouts(DEFAULT_LAYOUTS);
    localStorage.removeItem('dashboard_layouts');
  };

  return (
    <div className="p-4 sm:p-6">
      {/* Layout controls */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <button
          onClick={resetLayout}
          className="text-gray-500 hover:text-white p-1.5 rounded hover:bg-gray-800 transition-colors"
          title="Reset layout"
        >
          <RotateCcw size={15} />
        </button>
        <button
          onClick={() => setLocked(!locked)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            locked
              ? 'text-gray-500 border-gray-700 hover:border-gray-600'
              : 'text-accent-400 border-accent-600/50 bg-accent-600/10'
          }`}
        >
          {locked ? <Lock size={12} /> : <Unlock size={12} />}
          {locked ? 'Locked' : 'Editing'}
        </button>
      </div>

      <ResponsiveGridLayout
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 768, sm: 0 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={40}
        isDraggable={!locked}
        isResizable={!locked}
        onLayoutChange={onLayoutChange}
        draggableHandle=".widget-handle"
        containerPadding={[0, 0]}
        margin={[12, 12]}
      >
        {/* Quick Actions */}
        <div key="quick-actions">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 h-full">
            <Link href="/chat" className="bg-accent-600/15 hover:bg-accent-600/25 border border-accent-600/30 text-white rounded-lg p-4 flex items-center gap-3 transition-colors">
              <MessageSquare size={20} className="text-accent-500" />
              <span className="text-sm font-medium">New Chat</span>
            </Link>
            <Link href="/documents" className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700 text-white rounded-lg p-4 flex items-center gap-3 transition-colors">
              <FileText size={20} className="text-gray-400" />
              <span className="text-sm font-medium">Upload Document</span>
            </Link>
            <Link href="/workflows" className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700 text-white rounded-lg p-4 flex items-center gap-3 transition-colors">
              <Zap size={20} className="text-gray-400" />
              <span className="text-sm font-medium">Run Workflow</span>
            </Link>
          </div>
        </div>

        {/* AI Credits */}
        {/* AI Briefing */}
        <div key="briefing">
          <BriefingWidget />
        </div>

        <div key="credits" className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
          <div className="widget-handle px-5 py-3 border-b border-gray-700 cursor-move">
            <h3 className="text-white font-semibold text-sm">AI Credits & Usage</h3>
            <p className="text-gray-500 text-xs">Last 30 days</p>
          </div>
          <div className="p-4 flex-1 overflow-auto">
            {!credits ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-900 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-0.5">Spend</p>
                    <p className="text-white text-lg font-bold">{credits.ai?.totalCost !== undefined ? formatCost(credits.ai.totalCost) : '--'}</p>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-0.5">Requests</p>
                    <p className="text-white text-lg font-bold">{credits.ai?.totalRequests ?? '--'}</p>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-0.5">Tokens</p>
                    <p className="text-white text-lg font-bold">{credits.ai?.totalTokens !== undefined ? formatTokens(credits.ai.totalTokens) : '--'}</p>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-0.5">Avg/Req</p>
                    <p className="text-white text-lg font-bold">{credits.ai?.totalRequests ? formatCost(credits.ai.totalCost / credits.ai.totalRequests) : '--'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { name: 'Anthropic', ok: !credits.ai?.error },
                    { name: 'Vercel', ok: !credits.vercel?.error },
                    { name: 'Supabase', ok: true },
                    { name: 'Clerk', ok: true },
                  ].map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.ok ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-gray-400">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Weather */}
        <div key="weather">
          <WeatherWidget />
        </div>

        {/* Notepad */}
        <div key="notepad" className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
          <div className="widget-handle px-5 py-3 border-b border-gray-700 flex items-center justify-between cursor-move">
            <h3 className="text-white font-semibold text-sm">Notepad</h3>
            <div className="flex items-center gap-3">
              <Link href="/notes" className="text-gray-500 hover:text-accent-400 transition-colors" title="New note">
                <Plus size={14} />
              </Link>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${noteSaved ? 'bg-green-400' : 'bg-yellow-400'}`} />
                <span className="text-gray-500 text-xs">{noteSaved ? 'Saved' : '...'}</span>
              </div>
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
                  body: JSON.stringify({ id: noteId, content: e.target.value }),
                });
                setNoteSaved(true);
              }, 1000);
            }}
            placeholder="Quick notes..."
            className="flex-1 bg-transparent text-gray-300 px-5 py-3 text-sm focus:outline-none resize-none placeholder-gray-600"
          />
        </div>

        {/* Recent Chats */}
        <div key="chats" className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
          <div className="widget-handle px-5 py-3 border-b border-gray-700 flex items-center justify-between cursor-move">
            <h3 className="text-white font-semibold text-sm">Recent Chats</h3>
            <Link href="/chat" className="text-accent-400 text-xs hover:underline">View all</Link>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-gray-700">
            {!data || data.recentChats.length === 0 ? (
              <p className="text-gray-500 text-sm p-5">No chats yet</p>
            ) : (
              data.recentChats.map((chat) => (
                <Link key={chat.id} href={`/chat/${chat.id}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-700 transition-colors">
                  <span className="text-white text-sm truncate mr-3">{chat.title}</span>
                  <span className="text-gray-500 text-xs whitespace-nowrap">{formatRelativeDate(chat.updated_at)}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Documents */}
        <div key="docs" className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
          <div className="widget-handle px-5 py-3 border-b border-gray-700 flex items-center justify-between cursor-move">
            <h3 className="text-white font-semibold text-sm">Recent Documents</h3>
            <Link href="/documents" className="text-accent-400 text-xs hover:underline">View all</Link>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-gray-700">
            {!data || data.recentDocs.length === 0 ? (
              <p className="text-gray-500 text-sm p-5">No documents yet</p>
            ) : (
              data.recentDocs.map((doc) => (
                <Link key={doc.id} href={`/documents/${doc.id}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-700 transition-colors">
                  <span className="text-white text-sm truncate mr-3">{doc.name}</span>
                  <span className="text-gray-500 text-xs whitespace-nowrap">{formatRelativeDate(doc.created_at)}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Calendar */}
        <div key="calendar">
          <CalendarWidget />
        </div>

        {/* To-Do */}
        <div key="todos" className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
          <div className="widget-handle px-5 py-3 border-b border-gray-700 flex items-center justify-between cursor-move">
            <h3 className="text-white font-semibold text-sm">To-Do</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAddingTodo(!addingTodo)}
                className="text-gray-500 hover:text-accent-400 transition-colors"
                title="Add task"
              >
                <Plus size={16} />
              </button>
              <Link href="/todos" className="text-accent-400 text-xs hover:underline">View all</Link>
            </div>
          </div>
          {addingTodo && (
            <div className="px-4 py-2.5 border-b border-gray-700 flex gap-2">
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                placeholder="New task..."
                autoFocus
                className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600"
              />
              <button
                onClick={addTodo}
                disabled={!newTodo.trim()}
                className="bg-accent-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-accent-700 transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
          <div className="flex-1 overflow-auto divide-y divide-gray-700">
            {!data || data.pendingTodos.length === 0 ? (
              <p className="text-gray-500 text-sm p-5">No pending tasks</p>
            ) : (
              data.pendingTodos.map((todo) => (
                <Link key={todo.id} href="/todos" className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-700 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${todo.status === 'in-progress' ? 'bg-yellow-400' : 'bg-blue-400'}`} />
                    <span className="text-white text-sm truncate">{todo.title}</span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${
                    todo.priority === 'urgent' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                    todo.priority === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                    'bg-gray-700 text-gray-400 border-gray-600'
                  }`}>{todo.priority}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Activity */}
        <div key="activity" className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
          <div className="widget-handle px-5 py-3 border-b border-gray-700 flex items-center justify-between cursor-move">
            <h3 className="text-white font-semibold text-sm">Recent Activity</h3>
            <Link href="/workflows" className="text-accent-400 text-xs hover:underline">View all</Link>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-gray-700">
            {!data || data.recentRuns.length === 0 ? (
              <p className="text-gray-500 text-sm p-5">No workflow runs yet</p>
            ) : (
              data.recentRuns.map((run) => (
                <div key={run.id} className="flex items-center justify-between px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${run.status === 'completed' ? 'bg-green-400' : run.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                    <span className="text-white text-sm truncate">{truncate(run.input, 50)}</span>
                  </div>
                  <span className="text-gray-500 text-xs whitespace-nowrap">{formatRelativeDate(run.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </ResponsiveGridLayout>
    </div>
  );
}
