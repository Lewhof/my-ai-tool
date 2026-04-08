'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, MessageSquare, CheckSquare, FileText, StickyNote,
  BookOpen, ClipboardList, KeyRound, Zap, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  href: string;
  meta?: string;
}

const TYPE_ICONS: Record<string, typeof Search> = {
  chat: MessageSquare,
  task: CheckSquare,
  document: FileText,
  note: StickyNote,
  kb: BookOpen,
  whiteboard: ClipboardList,
  vault: KeyRound,
  todo: CheckSquare,
};

const TYPE_LABELS: Record<string, string> = {
  chat: 'Chat',
  task: 'Task',
  document: 'Document',
  note: 'Note',
  kb: 'Knowledge Base',
  whiteboard: 'Whiteboard',
  vault: 'Vault',
  todo: 'Task',
};

const TYPE_TOASTS: Record<string, string> = {
  todo: 'Task created',
  note: 'Note saved',
  kb: 'KB entry added',
  whiteboard: 'Added to whiteboard',
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setSelectedIndex(0);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 200);
  };

  const navigate = (result: SearchResult) => {
    setOpen(false);
    router.push(result.href);
  };

  // Quick-capture: AI classifies and creates the item
  const quickCapture = async () => {
    if (!query.trim() || query.length < 3) return;
    setCapturing(true);
    try {
      const res = await fetch('/api/quick-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: query }),
      });
      if (res.ok) {
        const data = await res.json();
        const label = TYPE_TOASTS[data.created?.type] || 'Item created';
        const detail = data.classified?.due_date ? ` (due ${data.classified.due_date})` : '';
        toast.success(`${label}: ${data.created?.title}${detail}`);
        setOpen(false);
      } else {
        toast.error('Could not capture — try rephrasing');
      }
    } catch {
      toast.error('Capture failed');
    }
    setCapturing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        navigate(results[selectedIndex]);
      } else if (query.length >= 3 && !loading) {
        // No results or no selection — trigger quick-capture
        quickCapture();
      }
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 mx-4">
        <div className="rounded-2xl border border-border overflow-hidden shadow-2xl" style={{ background: 'var(--color-surface-1)' }}>
          {/* Input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search or type to capture..."
              className="flex-1 py-3.5 text-[14px] text-foreground placeholder-muted-foreground bg-transparent outline-none"
            />
            {capturing && <Loader2 size={14} className="animate-spin text-primary" />}
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground border border-border font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto">
            {loading && (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">Searching...</div>
            )}
            {!loading && query.length >= 2 && results.length === 0 && !capturing && (
              <div className="px-4 py-4">
                <p className="text-[13px] text-muted-foreground text-center mb-3">No results found</p>
                {query.length >= 3 && (
                  <button
                    onClick={quickCapture}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                      <Zap size={14} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-foreground">Quick Capture: &ldquo;{query}&rdquo;</p>
                      <p className="text-[10px] text-muted-foreground">AI will classify as task, note, KB entry, or whiteboard item</p>
                    </div>
                  </button>
                )}
              </div>
            )}
            {capturing && (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Classifying and creating...
              </div>
            )}
            {!loading && !capturing && results.length > 0 && (
              <div className="py-2">
                {results.map((result, i) => {
                  const Icon = TYPE_ICONS[result.type] || Search;
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => navigate(result)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        i === selectedIndex ? 'bg-surface-2' : 'hover:bg-surface-2'
                      )}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-surface-3)' }}>
                        <Icon size={14} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-foreground truncate">{result.title}</p>
                        <p className="text-[10px] text-muted-foreground">{TYPE_LABELS[result.type]}</p>
                      </div>
                    </button>
                  );
                })}

                {/* Quick capture option at bottom of results */}
                {query.length >= 3 && (
                  <button
                    onClick={quickCapture}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 border-t border-border mt-1 pt-3"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                      <Zap size={14} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-foreground">Quick Capture: &ldquo;{query}&rdquo;</p>
                      <p className="text-[10px] text-muted-foreground">Create as task, note, KB, or whiteboard</p>
                    </div>
                  </button>
                )}
              </div>
            )}
            {!loading && !capturing && query.length < 2 && (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                Search or type anything to quick-capture (task, note, KB, whiteboard)
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
            <span>
              <kbd className="px-1 py-0.5 rounded border border-border font-mono mx-0.5">&uarr;</kbd>
              <kbd className="px-1 py-0.5 rounded border border-border font-mono mx-0.5">&darr;</kbd>
              navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded border border-border font-mono mx-0.5">&crarr;</kbd>
              open / capture
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
