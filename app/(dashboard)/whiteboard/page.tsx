'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';
import { Pencil, Check, Play, Trash2, X, Sparkles } from 'lucide-react';

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
const SPRINTS = ['All Sprints', 'Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5', 'Sprint 6', 'Backlog'];

function getSprintFromTags(tags: string[]): string | null {
  const t = tags.find(t => t.startsWith('sprint-'));
  if (!t) return null;
  const num = t.replace('sprint-', '');
  return `Sprint ${num}`;
}

function getDisplayTags(tags: string[]): string[] {
  return tags.filter(t => !t.startsWith('sprint-'));
}

const STATUS_COLORS: Record<string, string> = {
  idea: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  scoped: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'in-progress': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  done: 'bg-green-500/20 text-green-400 border-green-500/30',
  parked: 'bg-muted text-muted-foreground border-border',
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
  const [newSprint, setNewSprint] = useState('');
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
        tags: [
        ...(newTags ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : []),
        ...(newSprint ? [`sprint-${newSprint}`] : []),
      ],
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

  const [sprintFilter, setSprintFilter] = useState('All Sprints');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [pushedIds, setPushedIds] = useState<Set<string>>(new Set());

  const startEdit = (item: WhiteboardItem) => {
    setEditingItemId(item.id);
    setEditTitle(item.title);
    setEditDesc(item.description || '');
  };

  const saveEdit = async () => {
    if (!editingItemId || !editTitle.trim()) return;
    await fetch(`/api/whiteboard/${editingItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, description: editDesc }),
    });
    setEditingItemId(null);
    fetchItems();
  };

  const markComplete = async (id: string) => {
    await updateStatus(id, 'done');
  };

  const handlePaste = async (e: React.ClipboardEvent, itemId: string) => {
    const items_list = e.clipboardData?.items;
    if (!items_list) return;
    for (const item of items_list) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        await uploadFileToItem(file, itemId, true);
        return;
      }
    }
  };

  /**
   * Upload a file (image, PDF, doc, etc.) to a whiteboard item.
   * Images are added as ![screenshot](url), other files as [filename](url).
   */
  const uploadFileToItem = async (file: File, itemId: string, isImage: boolean) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/notes-v2/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.url) return;

    const existing = items.find((i) => i.id === itemId);
    const markdown = isImage
      ? `\n![screenshot](${data.url})`
      : `\n[📎 ${file.name}](${data.url})`;

    const newDesc = (existing?.description || '') + markdown;

    // Update local state immediately so the modal reflects it
    setEditDesc(newDesc);

    await fetch(`/api/whiteboard/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newDesc }),
    });
    fetchItems();
  };

  const pushToClaude = async (item: WhiteboardItem) => {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        description: item.description,
        whiteboard_id: item.id,
      }),
    });
    // Update whiteboard status to in-progress
    await fetch(`/api/whiteboard/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in-progress' }),
    });
    setPushedIds((prev) => new Set(prev).add(item.id));
    fetchItems();
  };

  const filtered = items.filter((i) => {
    const statusMatch = activeFilter === 'All' || i.status === activeFilter;
    if (!statusMatch) return false;
    if (sprintFilter === 'All Sprints') return true;
    if (sprintFilter === 'Backlog') return !getSprintFromTags(i.tags);
    return getSprintFromTags(i.tags) === sprintFilter;
  });

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
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-12">#</th>
            <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3">Item</th>
            <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-24">Sprint</th>
            <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-32">Tags</th>
            <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-36">Status</th>
            <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 w-24">Added</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filtered.map((item) => (
            <React.Fragment key={item.id}>
              <tr
                className="hover:bg-secondary/50 cursor-pointer transition-colors"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <td className="px-5 py-3 text-muted-foreground text-sm font-mono">{item.priority}</td>
                <td className="px-5 py-3 text-foreground text-sm font-medium">{item.title}</td>
                <td className="px-5 py-3">
                  {(() => {
                    const sprint = getSprintFromTags(item.tags);
                    return sprint ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium">{sprint}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    );
                  })()}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {getDisplayTags(item.tags).map((tag) => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3"><StatusBadge item={item} /></td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{formatRelativeDate(item.created_at)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    {item.status !== 'done' && (
                      <button onClick={(e) => { e.stopPropagation(); markComplete(item.id); }} className="text-muted-foreground/60 hover:text-green-400 p-1 transition-colors rounded hover:bg-secondary" title="Mark complete"><Check size={13} /></button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); startEdit(item); }} className="text-muted-foreground/60 hover:text-primary p-1 transition-colors rounded hover:bg-secondary" title="Edit"><Pencil size={13} /></button>
                    <button
                      onClick={(e) => { e.stopPropagation(); pushToClaude(item); }}
                      disabled={pushedIds.has(item.id) || item.status === 'in-progress'}
                      className="text-muted-foreground/60 hover:text-primary p-1 transition-colors rounded hover:bg-secondary disabled:opacity-30"
                      title="Push to Claude Code"
                    >
                      {pushedIds.has(item.id) ? <Check size={13} /> : <Play size={13} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="text-muted-foreground/60 hover:text-red-400 p-1 transition-colors rounded hover:bg-secondary"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
              {expandedId === item.id && item.description && (
                <tr key={`${item.id}-desc`}>
                  <td colSpan={7} className="px-5 py-4 bg-background/50">
                    <pre className="text-foreground text-sm whitespace-pre-wrap font-sans leading-relaxed">{item.description}</pre>
                  </td>
                </tr>
              )}
            </React.Fragment>
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
          className="bg-card border border-border rounded-lg overflow-hidden hover:border-border transition-colors"
        >
          <div
            className="px-5 py-4 cursor-pointer"
            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-muted-foreground text-xs font-mono">#{item.priority}</span>
                  <h3 className="text-foreground font-medium">{item.title}</h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge item={item} />
                  {getSprintFromTags(item.tags) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium">
                      {getSprintFromTags(item.tags)}
                    </span>
                  )}
                  {getDisplayTags(item.tags).map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{tag}</span>
                  ))}
                  <span className="text-muted-foreground/60 text-xs">{formatRelativeDate(item.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {item.status !== 'done' && (
                  <button onClick={(e) => { e.stopPropagation(); markComplete(item.id); }} className="text-muted-foreground/60 hover:text-green-400 p-1 rounded hover:bg-secondary transition-colors" title="Mark complete"><Check size={14} /></button>
                )}
                <button onClick={(e) => { e.stopPropagation(); startEdit(item); }} className="text-muted-foreground/60 hover:text-primary p-1 rounded hover:bg-secondary transition-colors" title="Edit"><Pencil size={14} /></button>
                <button
                  onClick={(e) => { e.stopPropagation(); pushToClaude(item); }}
                  disabled={pushedIds.has(item.id) || item.status === 'in-progress'}
                  className="text-muted-foreground/60 hover:text-primary p-1 rounded hover:bg-secondary transition-colors disabled:opacity-30"
                  title="Push to Claude Code"
                >
                  {pushedIds.has(item.id) ? <Check size={14} /> : <Play size={14} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="text-muted-foreground/60 hover:text-red-400 p-1 rounded hover:bg-secondary transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
          {expandedId === item.id && item.description && (
            <div className="px-5 pb-4 border-t border-border pt-3">
              <pre className="text-foreground text-sm whitespace-pre-wrap font-sans leading-relaxed">{item.description}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Edit Modal */}
      {editingItemId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditingItemId(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-4 sm:p-6 space-y-3 sm:space-y-4 mx-3 sm:mx-0" onClick={(e) => e.stopPropagation()} onPaste={(e) => handlePaste(e, editingItemId)}>
            <h3 className="text-foreground font-semibold">Edit Item</h3>
            <div>
              <label className="text-foreground text-sm block mb-1">Title</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Description / Scope</label>
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={8} className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Paste screenshots with Ctrl+V" />
            </div>
            <p className="text-muted-foreground/60 text-xs">Tip: Paste screenshots (Ctrl+V) or attach files (PDF, docs, images) to the description.</p>

            {/* Hidden file input — accepts images, PDFs, docs */}
            <input
              id="whiteboard-file-upload"
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.xlsx"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file && editingItemId) {
                  await uploadFileToItem(file, editingItemId, file.type.startsWith('image/'));
                }
                e.target.value = '';
              }}
            />

            <div className="flex gap-2 flex-wrap">
              <button onClick={saveEdit} className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary">Save</button>
              <button
                onClick={() => document.getElementById('whiteboard-file-upload')?.click()}
                className="text-muted-foreground px-4 py-2 rounded-lg text-sm border border-border hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5"
              >
                📎 Attach File
              </button>
              <button onClick={() => setEditingItemId(null)} className="text-muted-foreground px-4 py-2 rounded-lg text-sm hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Whiteboard</h2>
          <p className="text-muted-foreground text-sm mt-1">Pipeline ideas, scoping, and dev backlog</p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <button
              onClick={seedWhiteboard}
              className="bg-secondary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors border border-border"
            >
              Seed Items
            </button>
          )}
          <button
            onClick={async () => {
              const res = await fetch('/api/whiteboard/prioritize', { method: 'POST' });
              if (res.ok) fetchItems();
            }}
            className="text-muted-foreground hover:text-primary px-3 py-2 rounded-lg text-sm border border-border hover:border-primary/50 transition-colors flex items-center gap-1.5"
            title="AI auto-prioritize"
          >
            <Sparkles size={14} />
            Prioritize
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors"
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
                    ? 'bg-white text-background border-white'
                    : 'bg-transparent text-muted-foreground border-border hover:border-white/15 hover:text-foreground'
                )}
              >
                {status === 'All' ? 'All' : STATUS_LABELS[status]} ({count})
              </button>
            );
          })}
        </div>

        {/* View toggle */}
        <div className="flex bg-card border border-border rounded-lg overflow-hidden shrink-0">
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'px-3 py-1.5 text-sm transition-colors',
              viewMode === 'table' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="Table view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18"/></svg>
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={cn(
              'px-3 py-1.5 text-sm transition-colors',
              viewMode === 'card' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="Card view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          </button>
        </div>
      </div>

      {/* Sprint Filter */}
      <div className="flex gap-2 flex-wrap">
        {SPRINTS.map((sprint) => {
          const count = sprint === 'All Sprints'
            ? items.length
            : sprint === 'Backlog'
              ? items.filter(i => !getSprintFromTags(i.tags)).length
              : items.filter(i => getSprintFromTags(i.tags) === sprint).length;
          return (
            <button
              key={sprint}
              onClick={() => setSprintFilter(sprint)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                sprintFilter === sprint
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : 'text-muted-foreground border-border hover:border-white/15 hover:text-foreground'
              )}
            >
              {sprint} ({count})
            </button>
          );
        })}
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div>
            <label className="text-foreground text-sm block mb-1">Title</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What needs to be built?"
              className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-foreground text-sm block mb-1">Description / Scope</label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={4}
              placeholder="Describe the feature, scope, or context..."
              className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-foreground text-sm block mb-1">Sprint</label>
              <select
                value={newSprint}
                onChange={(e) => setNewSprint(e.target.value)}
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Backlog</option>
                <option value="1">Sprint 1</option>
                <option value="2">Sprint 2</option>
                <option value="3">Sprint 3</option>
                <option value="4">Sprint 4</option>
                <option value="5">Sprint 5</option>
                <option value="6">Sprint 6</option>
              </select>
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Tags (comma separated)</label>
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="feature, chat, agent"
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <button
            onClick={addItem}
            disabled={!newTitle.trim()}
            className="bg-primary text-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary transition-colors disabled:opacity-50"
          >
            Add to Whiteboard
          </button>
        </div>
      )}

      {/* Items */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
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
