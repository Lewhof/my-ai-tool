'use client';

import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn, formatRelativeDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { List, LayoutGrid, ChevronLeft, Trash2, GitFork, Loader2 } from 'lucide-react';

interface KBEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const DEFAULT_CATEGORIES = ['All', 'AI Tools', 'Architecture', 'Decisions', 'How-To', 'Reference', 'General'];

export default function KnowledgeBasePage() {
  const router = useRouter();
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [generatingDiagram, setGeneratingDiagram] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedGridId, setExpandedGridId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [newTags, setNewTags] = useState('');

  const fetchEntries = useCallback(async () => {
    const res = await fetch('/api/kb');
    const data = await res.json();
    setEntries(data.entries ?? []);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const addEntry = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    await fetch('/api/kb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle,
        content: newContent,
        category: newCategory,
        tags: newTags ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      }),
    });
    setNewTitle(''); setNewContent(''); setNewCategory('General'); setNewTags('');
    setShowAdd(false);
    fetchEntries();
  };

  const updateEntry = async (id: string, updates: Partial<KBEntry>) => {
    await fetch(`/api/kb/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setEditingId(null);
    fetchEntries();
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    await fetch(`/api/kb/${id}`, { method: 'DELETE' });
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (expandedGridId === id) setExpandedGridId(null);
  };

  const generateDiagram = async (entryId: string) => {
    setGeneratingDiagram(entryId);
    try {
      const res = await fetch(`/api/kb/${entryId}/diagram`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.diagramId) router.push(`/diagrams/${data.diagramId}`);
      }
    } catch { /* silent */ }
    finally { setGeneratingDiagram(null); }
  };

  const categories = [...new Set([...DEFAULT_CATEGORIES, ...entries.map((e) => e.category)])];

  const filtered = entries.filter((e) => {
    const matchesCat = activeCategory === 'All' || e.category === activeCategory;
    const matchesSearch = !search ||
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.content.toLowerCase().includes(search.toLowerCase()) ||
      e.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const selected = entries.find((e) => e.id === selectedId);

  // ── Shared header (search, categories, add form) ──
  const Header = () => (
    <div className="p-4 border-b border-border space-y-3 shrink-0">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Knowledge Base</h2>
        <div className="flex gap-2 items-center">
          {entries.length === 0 && (
            <button onClick={async () => { await fetch('/api/kb/seed', { method: 'POST' }); fetchEntries(); }} className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 border border-border rounded transition-colors">Seed</button>
          )}
          <div className="flex bg-card border border-border rounded-lg overflow-hidden">
            <button onClick={() => { setViewMode('list'); setExpandedGridId(null); }} className={cn('p-1.5 transition-colors', viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')} title="List view"><List size={14} /></button>
            <button onClick={() => { setViewMode('grid'); setSelectedId(null); }} className={cn('p-1.5 transition-colors', viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')} title="Grid view"><LayoutGrid size={14} /></button>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} className="bg-primary text-foreground px-3 py-1 rounded-lg text-sm font-medium hover:bg-primary transition-colors">{showAdd ? 'Cancel' : '+'}</button>
        </div>
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full bg-card text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder-muted-foreground" />
      <div className="flex gap-1.5 flex-wrap">
        {categories.filter((c) => c === 'All' || entries.some((e) => e.category === c)).map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)} className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors', activeCategory === cat ? 'bg-white text-background border-white' : 'text-muted-foreground border-border hover:border-white/15')}>{cat}</button>
        ))}
      </div>

      {showAdd && (
        <div className="space-y-3 border-t border-border pt-3">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title" className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-sm">
            {DEFAULT_CATEGORIES.filter((c) => c !== 'All').map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={6} placeholder="Content (supports Markdown tables, headers, lists...)" className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none font-mono" />
          <input value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="Tags (comma separated)" className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          <button onClick={addEntry} disabled={!newTitle.trim() || !newContent.trim()} className="bg-primary text-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary transition-colors disabled:opacity-50">Save Entry</button>
        </div>
      )}
    </div>
  );

  // ── Grid View ──
  if (viewMode === 'grid') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <Header />
        <div className="flex-1 overflow-auto p-4">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">{search ? 'No matches.' : 'No entries yet.'}</p>
          ) : (
            <div className="space-y-4">
              {filtered.map((entry) => (
                <div key={entry.id} className="bg-card border border-border rounded-lg overflow-hidden">
                  {/* Card header */}
                  <div
                    className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => setExpandedGridId(expandedGridId === entry.id ? null : entry.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-foreground font-semibold text-sm">{entry.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{entry.category}</span>
                        {entry.tags.map((tag) => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-card text-muted-foreground">{tag}</span>
                        ))}
                        <span className="text-muted-foreground/60 text-xs">{formatRelativeDate(entry.updated_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); generateDiagram(entry.id); }}
                      disabled={generatingDiagram === entry.id}
                      className="text-muted-foreground/60 hover:text-primary transition-colors ml-2 disabled:animate-pulse"
                      title="Generate diagram"
                    >
                      {generatingDiagram === entry.id ? <Loader2 size={14} className="animate-spin" /> : <GitFork size={14} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }} className="text-muted-foreground/60 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                  </div>
                  {/* Expanded content with rendered markdown */}
                  {expandedGridId === entry.id && (
                    <div className="px-5 py-4 border-t border-border">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List View (split pane) ──
  return (
    <div className="flex h-full min-h-0">
      {/* Left panel */}
      <div className={cn('flex flex-col border-r border-border shrink-0', selected ? 'hidden md:flex md:w-80' : 'w-full md:w-80')}>
        <Header />
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">{search ? 'No matches.' : 'No entries yet.'}</p>
          ) : (
            filtered.map((entry) => (
              <button key={entry.id} onClick={() => setSelectedId(entry.id)} className={cn('w-full text-left px-4 py-3 border-b border-border transition-colors', selectedId === entry.id ? 'bg-secondary' : 'hover:bg-card')}>
                <p className="text-foreground text-sm font-medium truncate">{entry.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{entry.category}</span>
                  <span className="text-muted-foreground/60 text-xs">{formatRelativeDate(entry.updated_at)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className={cn('flex-1 flex flex-col min-w-0 min-h-0', !selected && 'hidden md:flex')}>
        {selected ? (
          <>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setSelectedId(null)} className="md:hidden text-muted-foreground hover:text-foreground transition-colors"><ChevronLeft size={20} /></button>
                <div className="min-w-0">
                  <h2 className="text-foreground text-lg font-semibold truncate">{selected.title}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">{selected.category}</span>
                    {selected.tags.map((tag) => (<span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-card text-muted-foreground">{tag}</span>))}
                    <span className="text-muted-foreground/60 text-xs">Updated {formatRelativeDate(selected.updated_at)}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => generateDiagram(selected.id)}
                  disabled={generatingDiagram === selected.id}
                  className="text-muted-foreground hover:text-primary text-xs px-3 py-1.5 border border-border rounded-lg transition-colors disabled:animate-pulse flex items-center gap-1.5"
                >
                  {generatingDiagram === selected.id ? <Loader2 size={12} className="animate-spin" /> : <GitFork size={12} />}
                  Diagram
                </button>
                <button onClick={() => setEditingId(editingId === selected.id ? null : selected.id)} className="text-muted-foreground hover:text-foreground text-xs px-3 py-1.5 border border-border rounded-lg transition-colors">{editingId === selected.id ? 'Preview' : 'Edit'}</button>
                <button onClick={() => deleteEntry(selected.id)} className="text-muted-foreground hover:text-red-400 text-xs px-3 py-1.5 border border-border rounded-lg transition-colors">Delete</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {editingId === selected.id ? (
                <div className="space-y-3">
                  <input defaultValue={selected.title} onBlur={(e) => updateEntry(selected.id, { title: e.target.value })} className="w-full bg-card text-foreground border border-border rounded-lg px-4 py-2 text-lg font-semibold focus:outline-none focus:ring-1 focus:ring-ring" />
                  <textarea defaultValue={selected.content} onBlur={(e) => updateEntry(selected.id, { content: e.target.value })} rows={20} className="w-full bg-card text-foreground border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none font-mono leading-relaxed" />
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none prose-table:border-collapse prose-th:border prose-th:border-border prose-th:bg-card prose-th:px-4 prose-th:py-2 prose-th:text-left prose-td:border prose-td:border-border prose-td:px-4 prose-td:py-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Select an entry to view</p>
          </div>
        )}
      </div>
    </div>
  );
}
