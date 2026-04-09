'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toast, Toaster } from 'sonner';
import {
  BookOpen, Zap, Quote, CheckSquare, ClipboardList, StickyNote,
  Loader2, Check, X, ExternalLink, Sparkles, Globe,
} from 'lucide-react';

interface Suggestion {
  route: 'kb' | 'book' | 'highlight' | 'task' | 'whiteboard' | 'note';
  title: string;
  tags: string[];
  summary: string;
  reason: string;
}

interface ExtractedData {
  url: string;
  canonical_url: string;
  title: string;
  byline: string;
  content: string;
  excerpt: string;
  site: string;
  og_image: string | null;
  word_count: number;
  cached: boolean;
  extracted: boolean;
}

type Destination = 'kb' | 'book' | 'highlight' | 'task' | 'whiteboard' | 'note';

const DESTINATIONS: Array<{ id: Destination; label: string; icon: typeof BookOpen; color: string }> = [
  { id: 'kb', label: 'Knowledge Base', icon: BookOpen, color: 'text-blue-400' },
  { id: 'book', label: 'Mind Library (Book)', icon: BookOpen, color: 'text-purple-400' },
  { id: 'highlight', label: 'Highlight', icon: Quote, color: 'text-orange-400' },
  { id: 'task', label: 'Task', icon: CheckSquare, color: 'text-green-400' },
  { id: 'whiteboard', label: 'Whiteboard', icon: ClipboardList, color: 'text-pink-400' },
  { id: 'note', label: 'Note', icon: StickyNote, color: 'text-yellow-400' },
];

function CaptureInner() {
  const params = useSearchParams();
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [destination, setDestination] = useState<Destination>('kb');
  const [title, setTitle] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Params may come from bookmarklet, PWA share target (GET), or manual link
  const url = params.get('url') || params.get('text') || '';
  const paramTitle = params.get('title') || '';
  const selection = params.get('selection') || '';

  useEffect(() => {
    if (!url) {
      setLoading(false);
      setError('No URL provided. Install the bookmarklet from Settings → Capture.');
      return;
    }

    const loadPreview = async () => {
      try {
        const res = await fetch('/api/clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            title: paramTitle,
            selection,
            mode: 'preview',
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          setError(err.error || 'Failed to extract content');
          setLoading(false);
          return;
        }

        const data = await res.json();
        setExtracted(data.extracted);
        setSuggestion(data.suggestion);
        setTitle(data.extracted?.title || paramTitle || '');

        if (data.suggestion) {
          setDestination(data.suggestion.route);
          setTags(data.suggestion.tags || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [url, paramTitle, selection]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          title,
          selection,
          route: destination,
          tags,
          mode: 'save',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }

      setSaved(true);
      toast.success(`Saved to ${destinationLabel(destination)}`);

      // Auto-close after 1.2s if opened as popup
      setTimeout(() => {
        if (window.opener) {
          window.close();
        }
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput('');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 bg-background">
        <Loader2 size={24} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Extracting content...</p>
        {url && <p className="text-muted-foreground/60 text-xs truncate max-w-md px-4">{url}</p>}
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 bg-background">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
          <Check size={24} className="text-green-400" />
        </div>
        <p className="text-foreground text-base font-semibold">Saved to {destinationLabel(destination)}</p>
        <p className="text-muted-foreground text-xs">Closing window...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <Toaster position="top-center" />
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-brand)' }}>
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <h1 className="text-foreground text-lg font-bold">Clip to Lewhof AI</h1>
            {extracted?.site && (
              <p className="text-muted-foreground text-[11px] flex items-center gap-1">
                <Globe size={10} />
                {extracted.site}
                {extracted.word_count > 0 && (
                  <span className="text-muted-foreground/60">· {extracted.word_count} words</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Preview card */}
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
          {extracted?.og_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={extracted.og_image} alt="" className="w-full h-32 object-cover border-b border-border" />
          )}
          <div className="p-4 space-y-3">
            {/* Title (editable) */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Selection (if present) */}
            {selection && (
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Your selection</label>
                <div className="mt-1 bg-background border-l-2 border-primary pl-3 py-2 text-foreground text-sm italic">
                  &ldquo;{selection.slice(0, 400)}{selection.length > 400 ? '…' : ''}&rdquo;
                </div>
              </div>
            )}

            {/* Excerpt / extracted preview */}
            {extracted?.excerpt && !selection && (
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Excerpt</label>
                <p className="text-muted-foreground text-xs mt-1 leading-relaxed line-clamp-3">
                  {extracted.excerpt}
                </p>
              </div>
            )}

            {/* URL */}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/60 text-[11px] flex items-center gap-1 hover:text-muted-foreground truncate"
              >
                <ExternalLink size={10} className="shrink-0" />
                <span className="truncate">{url}</span>
              </a>
            )}

            {!extracted?.extracted && extracted && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-400 text-[11px]">
                Could not fully extract article content. Title and URL will still be saved.
              </div>
            )}
          </div>
        </div>

        {/* AI suggestion */}
        {suggestion && (
          <div className="bg-card border border-primary/30 rounded-xl p-3 mb-4 flex items-start gap-2" style={{ background: 'var(--color-surface-2)' }}>
            <Sparkles size={12} className="text-primary shrink-0 mt-0.5" />
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              <span className="text-primary font-medium">AI suggests:</span> {suggestion.reason || `Route to ${destinationLabel(suggestion.route)}`}
            </p>
          </div>
        )}

        {/* Destination picker */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Save to</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {DESTINATIONS.map(d => {
              const Icon = d.icon;
              const isSelected = destination === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDestination(d.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/60 hover:bg-surface-2'
                  )}
                >
                  <Icon size={14} className={d.color} />
                  <span className={cn('text-xs font-medium', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                    {d.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tags */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Tags</label>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1 text-[11px] bg-secondary text-foreground px-2 py-0.5 rounded-full">
                {t}
                <button onClick={() => setTags(tags.filter(x => x !== t))} className="text-muted-foreground hover:text-red-400">
                  <X size={9} />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="Add tag..."
              className="flex-1 min-w-[80px] bg-background border border-border rounded-full px-3 py-1 text-foreground text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (window.opener) window.close(); else window.history.back(); }}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function destinationLabel(d: Destination): string {
  return DESTINATIONS.find(x => x.id === d)?.label || d;
}

export default function CapturePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-screen gap-3 bg-background">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    }>
      <CaptureInner />
    </Suspense>
  );
}
