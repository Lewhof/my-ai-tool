'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';

interface WhiteboardItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const STATUSES = ['All', 'idea', 'scoped', 'in-progress', 'done', 'parked'];

const STATUS_COLORS: Record<string, string> = {
  idea: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  scoped: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'in-progress': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  done: 'bg-green-500/20 text-green-400 border-green-500/30',
  parked: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  idea: 'Idea',
  scoped: 'Scoped',
  'in-progress': 'In Progress',
  done: 'Done',
  parked: 'Parked',
};

export default function WhiteboardPage() {
  const [items, setItems] = useState<WhiteboardItem[]>([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTags, setNewTags] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const res = await fetch('/api/whiteboard');
    const data = await res.json();
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addItem = async () => {
    if (!newTitle.trim()) return;
    await fetch('/api/whiteboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle,
        description: newDesc || null,
        tags: newTags ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      }),
    });
    setNewTitle('');
    setNewDesc('');
    setNewTags('');
    setShowAdd(false);
    fetchItems();
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/whiteboard/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setEditingId(null);
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    await fetch(`/api/whiteboard/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const filtered = activeFilter === 'All'
    ? items
    : items.filter((i) => i.status === activeFilter);

  const seedWhiteboard = async () => {
    await fetch('/api/whiteboard/seed', { method: 'POST' });
    fetchItems();
  };

  // ── Status badge (reused in both views) ──
  const StatusBadge = ({ item }: { item: WhiteboardItem }) => {
    if (editingId === item.id) {
      return (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => updateStatus(item.id, key)}
              className={cn(
                'text-xs px-2 py-1 rounded-full border',
                STATUS_COLORS[key],
                item.status === key && 'ring-1 ring-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      );
    }
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditingId(item.id); }}
        className={cn('text-xs px-2.5 py-1 rounded-full border', STATUS_COLORS[item.status] || STATUS_COLORS.idea)}
      >
        {STATUS_LABELS[item.status] || item.status}
      </button>
    );
  };

  // ── Table View ──
  const TableView = () => (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3 w-12">#</th>
            <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Item</th>
            <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3 w-32">Tags</th>
            <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3 w-36">Status</th>
            <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3 w-24">Added</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {filtered.map((item) => (
            <>
              <tr
                key={item.id}
                className="hover:bg-gray-700/50 cursor-pointer transition-colors"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <td className="px-5 py-3 text-gray-500 text-sm font-mono">{item.priority}</td>
                <td className="px-5 py-3 text-white text-sm font-medium">{item.title}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {item.tags.map((tag) => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3"><StatusBadge item={item} /></td>
                <td className="px-5 py-3 text-gray-500 text-xs">{formatRelativeDate(item.created_at)}</td>
                <td className="px-3 py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                    className="text-gray-600 hover:text-red-400 text-sm transition-colors"
                  >
                    x
                  </button>
                </td>
              </tr>
              {expandedId === item.id && item.description && (
                <tr key={`${item.id}-desc`}>
                  <td colSpan={6} className="px-5 py-4 bg-gray-900/50">
                    <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed">{item.description}</pre>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Card View ──
  const CardView = () => (
    <div className="space-y-3">
      {filtered.map((item) => (
        <div
          key={item.id}
          className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition-colors"
        >
          <div
            className="px-5 py-4 cursor-pointer"
            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-gray-500 text-xs font-mono">#{item.priority}</span>
                  <h3 className="text-white font-medium">{item.title}</h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge item={item} />
                  {item.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{tag}</span>
                  ))}
                  <span className="text-gray-600 text-xs">{formatRelativeDate(item.created_at)}</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                className="text-gray-600 hover:text-red-400 text-sm transition-colors"
              >
                x
              </button>
            </div>
          </div>
          {expandedId === item.id && item.description && (
            <div className="px-5 pb-4 border-t border-gray-700 pt-3">
              <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed">{item.description}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Whiteboard</h2>
          <p className="text-gray-500 text-sm mt-1">Pipeline ideas, scoping, and dev backlog</p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <button
              onClick={seedWhiteboard}
              className="bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors border border-gray-600"
            >
              Seed Items
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-accent-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Item'}
          </button>
        </div>
      </div>

      {/* Status Tabs + View Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((status) => {
            const count = status === 'All'
              ? items.length
              : items.filter((i) => i.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setActiveFilter(status)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium border transition-colors',
                  activeFilter === status
                    ? 'bg-white text-gray-900 border-white'
                    : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400 hover:text-gray-300'
                )}
              >
                {status === 'All' ? 'All' : STATUS_LABELS[status]} ({count})
              </button>
            );
          })}
        </div>

        {/* View toggle */}
        <div className="flex bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shrink-0">
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'px-3 py-1.5 text-sm transition-colors',
              viewMode === 'table' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            )}
            title="Table view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18"/></svg>
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={cn(
              'px-3 py-1.5 text-sm transition-colors',
              viewMode === 'card' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            )}
            title="Card view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div>
            <label className="text-gray-300 text-sm block mb-1">Title</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What needs to be built?"
              className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-accent-600"
            />
          </div>
          <div>
            <label className="text-gray-300 text-sm block mb-1">Description / Scope</label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={4}
              placeholder="Describe the feature, scope, or context..."
              className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-600 resize-none"
            />
          </div>
          <div>
            <label className="text-gray-300 text-sm block mb-1">Tags (comma separated)</label>
            <input
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="feature, chat, agent"
              className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-accent-600"
            />
          </div>
          <button
            onClick={addItem}
            disabled={!newTitle.trim()}
            className="bg-accent-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-accent-700 transition-colors disabled:opacity-50"
          >
            Add to Whiteboard
          </button>
        </div>
      )}

      {/* Items */}
      {filtered.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            {activeFilter !== 'All' ? 'No items with this status.' : 'Whiteboard is empty. Add your first idea.'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <TableView />
      ) : (
        <CardView />
      )}
    </div>
  );
}
