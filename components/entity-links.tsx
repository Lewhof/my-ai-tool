'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link2, X, Search, FileText, CheckSquare, BookOpen, Layout, Loader2, Plus } from 'lucide-react';

interface LinkedItem {
  id: string;
  linked_type: string;
  linked_id: string;
  title: string;
  direction: 'incoming' | 'outgoing';
  created_at: string;
}

interface SearchResult {
  type: string;
  id: string;
  title: string;
  meta: string;
}

interface EntityLinksProps {
  entityType: string;  // 'todo', 'note', 'kb'
  entityId: string;
  compact?: boolean;   // minimal display for card view
}

const TYPE_CONFIG: Record<string, { icon: typeof FileText; label: string; color: string; href: string }> = {
  todo: { icon: CheckSquare, label: 'Task', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', href: '/todos' },
  note: { icon: FileText, label: 'Note', color: 'text-green-400 bg-green-500/10 border-green-500/20', href: '/notes' },
  kb: { icon: BookOpen, label: 'KB', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', href: '/kb' },
  whiteboard: { icon: Layout, label: 'Board', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', href: '/whiteboard' },
  document: { icon: FileText, label: 'Doc', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', href: '/documents' },
};

// Map search result types to entity link types
const SEARCH_TYPE_MAP: Record<string, string> = {
  task: 'todo',
  note: 'note',
  kb: 'kb',
  whiteboard: 'whiteboard',
  document: 'document',
};

export default function EntityLinks({ entityType, entityId, compact = false }: EntityLinksProps) {
  const [links, setLinks] = useState<LinkedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/links?entity_type=${entityType}&entity_id=${entityId}`);
      if (res.ok) {
        const data = await res.json();
        setLinks(data.links ?? []);
      }
    } catch { /* skip */ }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  useEffect(() => {
    if (showPicker && searchRef.current) {
      searchRef.current.focus();
    }
  }, [showPicker]);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSearchResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          // Filter out the current entity and already-linked items
          const linkedIds = new Set(links.map(l => l.linked_id));
          const filtered = (data.results ?? []).filter((r: SearchResult) => {
            const mappedType = SEARCH_TYPE_MAP[r.type] ?? r.type;
            if (mappedType === entityType && r.id === entityId) return false;
            if (linkedIds.has(r.id)) return false;
            return ['task', 'note', 'kb', 'whiteboard', 'document'].includes(r.type);
          });
          setSearchResults(filtered);
        }
      } catch { /* skip */ }
      setSearching(false);
    }, 300);
  };

  const createLink = async (targetType: string, targetId: string) => {
    setLinking(true);
    const mappedType = SEARCH_TYPE_MAP[targetType] ?? targetType;
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: entityType,
          source_id: entityId,
          target_type: mappedType,
          target_id: targetId,
        }),
      });
      if (res.ok) {
        await fetchLinks();
        setShowPicker(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    } catch { /* skip */ }
    setLinking(false);
  };

  const removeLink = async (linkId: string) => {
    await fetch(`/api/links?id=${linkId}`, { method: 'DELETE' });
    setLinks(prev => prev.filter(l => l.id !== linkId));
  };

  // Compact view: just show link count badge
  if (compact) {
    if (loading || links.length === 0) return null;
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
        <Link2 size={10} />
        {links.length}
      </span>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 size={12} />
          <span>Linked Items{links.length > 0 ? ` (${links.length})` : ''}</span>
        </div>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1"
        >
          <Plus size={10} />
          Link
        </button>
      </div>

      {/* Link Picker */}
      {showPicker && (
        <div className="mb-3 bg-background border border-border rounded-lg p-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search tasks, notes, KB..."
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-card border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            {searching && <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {searchResults.map(result => {
                const mappedType = SEARCH_TYPE_MAP[result.type] ?? result.type;
                const config = TYPE_CONFIG[mappedType];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <button
                    key={result.id}
                    onClick={() => createLink(result.type, result.id)}
                    disabled={linking}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary text-left transition-colors"
                  >
                    <span className={`p-1 rounded border ${config.color}`}>
                      <Icon size={10} />
                    </span>
                    <span className="text-xs text-foreground truncate flex-1">{result.title}</span>
                    <span className="text-[10px] text-muted-foreground">{config.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No results found</p>
          )}
        </div>
      )}

      {/* Linked Items List */}
      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
          <Loader2 size={10} className="animate-spin" />
          Loading...
        </div>
      ) : links.length === 0 && !showPicker ? (
        <p className="text-xs text-muted-foreground/60 py-1">No linked items</p>
      ) : (
        <div className="space-y-1">
          {links.map(link => {
            const config = TYPE_CONFIG[link.linked_type];
            if (!config) return null;
            const Icon = config.icon;
            return (
              <div key={link.id} className="flex items-center gap-2 group">
                <span className={`p-1 rounded border ${config.color}`}>
                  <Icon size={10} />
                </span>
                <span className="text-xs text-foreground truncate flex-1">{link.title}</span>
                <span className="text-[10px] text-muted-foreground">{config.label}</span>
                <button
                  onClick={() => removeLink(link.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
