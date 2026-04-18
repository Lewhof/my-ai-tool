'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Sparkles, Download, Image as ImageIcon, Loader2, Zap,
  CheckCircle2, XCircle, AlertTriangle, Wand2, RefreshCw, Trash2,
} from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  description: string;
  priority: number;
  configured: boolean;
  envKey: string;
}

interface GenerationAttempt {
  provider: string;
  success: boolean;
  error?: string;
}

interface GenerationResult {
  image: string;
  text?: string;
  provider: string;
  attempts: GenerationAttempt[];
}

interface GalleryItem {
  id: string;
  prompt: string;
  url: string | null;
  provider: string | null;
  source: 'cerebro' | 'image_lab';
  created_at: string;
}

type Size = 'square' | 'landscape' | 'portrait';

export default function ImageLabPage() {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<Size>('square');
  const [selectedProvider, setSelectedProvider] = useState<string>('auto');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<{ message: string; attempts?: GenerationAttempt[] } | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  const loadGallery = async () => {
    try {
      const res = await fetch('/api/images');
      const data = await res.json();
      setGallery(data.images ?? []);
    } catch {
      // non-fatal
    } finally {
      setGalleryLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/images/providers')
      .then(r => r.json())
      .then(data => {
        setProviders(data.providers ?? []);
      })
      .catch(() => { toast.error('Could not load providers'); })
      .finally(() => setProvidersLoading(false));
    loadGallery();
  }, []);

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, provider: selectedProvider, size }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError({ message: data.error || 'Generation failed', attempts: data.attempts });
        return;
      }

      setResult(data);
      if (data.image) {
        // Refresh gallery from DB — the new row is now persisted
        loadGallery();
      }
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setGenerating(false);
    }
  };

  const deleteGalleryItem = async (id: string) => {
    const snapshot = gallery;
    setGallery(prev => prev.filter(g => g.id !== id));
    try {
      const res = await fetch(`/api/images?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
    } catch {
      setGallery(snapshot);
      toast.error('Could not delete image');
    }
  };

  const downloadImage = async (url: string, name: string) => {
    try {
      // For data URLs, direct download
      if (url.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.png`;
        a.click();
        return;
      }
      // For https URLs, fetch and download
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${name}.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error('Download failed');
    }
  };

  const configuredCount = providers.filter(p => p.configured).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Image Lab</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {providersLoading
              ? 'Loading providers...'
              : `${configuredCount} of ${providers.length} providers configured`}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col lg:flex-row gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
          {/* ── LEFT: Provider picker (vertical list) ── */}
          <aside className="lg:w-72 shrink-0 space-y-2">
            <h3 className="text-muted-foreground text-[11px] uppercase tracking-wider font-semibold mb-2">Provider</h3>

            {/* Auto option */}
            <button
              onClick={() => setSelectedProvider('auto')}
              className={cn(
                'w-full flex items-start gap-3 p-3 rounded-xl border transition-colors text-left',
                selectedProvider === 'auto'
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:bg-surface-2'
              )}
            >
              <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Zap size={14} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-sm font-medium">Auto (Fallback)</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">
                  Tries providers in order. Skips unconfigured ones.
                </p>
                {configuredCount > 0 && (
                  <p className="text-[10px] text-primary/80 mt-1">
                    {configuredCount} provider{configuredCount !== 1 ? 's' : ''} available
                  </p>
                )}
              </div>
            </button>

            {/* Individual providers */}
            {providers.map((p) => {
              const isSelected = selectedProvider === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => p.configured && setSelectedProvider(p.id)}
                  disabled={!p.configured}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 rounded-xl border transition-colors text-left relative',
                    !p.configured && 'opacity-50 cursor-not-allowed',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : p.configured
                        ? 'border-border bg-card hover:bg-surface-2'
                        : 'border-border/50 bg-card/50'
                  )}
                  title={!p.configured ? `Add ${p.envKey} to environment variables to enable` : undefined}
                >
                  <div className={cn(
                    'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                    p.configured ? 'bg-secondary' : 'bg-secondary/30'
                  )}>
                    <Wand2 size={14} className={p.configured ? 'text-foreground' : 'text-muted-foreground/50'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-foreground text-sm font-medium truncate">{p.name}</p>
                      {p.configured ? (
                        <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                      ) : (
                        <XCircle size={12} className="text-muted-foreground/40 shrink-0" />
                      )}
                    </div>
                    <p className="text-muted-foreground text-[11px] mt-0.5 line-clamp-2">
                      {p.description}
                    </p>
                    {!p.configured && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                        Needs {p.envKey}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </aside>

          {/* ── RIGHT: Main generation area ── */}
          <main className="flex-1 min-w-0 space-y-4">
            {/* Prompt input */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } }}
                placeholder="Describe the image you want to generate..."
                rows={3}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder-muted-foreground"
                disabled={generating}
              />

              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Size selector */}
                <div className="flex items-center gap-1">
                  {(['square', 'landscape', 'portrait'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                        size === s
                          ? 'bg-primary/20 text-primary border border-primary/40'
                          : 'text-muted-foreground hover:text-foreground border border-border'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Generate button */}
                <button
                  onClick={generate}
                  disabled={generating || !prompt.trim() || (selectedProvider !== 'auto' && !providers.find(p => p.id === selectedProvider)?.configured)}
                  className={cn(
                    'px-5 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shrink-0',
                    'bg-primary text-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {generating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-red-400 text-sm font-medium">{error.message}</p>
                    {error.attempts && error.attempts.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Attempts</p>
                        {error.attempts.map((a, i) => (
                          <div key={i} className="flex items-start gap-2 text-[12px]">
                            {a.success ? (
                              <CheckCircle2 size={12} className="text-green-400 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <span className="text-foreground font-medium">{a.provider}</span>
                              {a.error && <span className="text-muted-foreground"> — {a.error}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Attempt trace header */}
                {result.attempts && result.attempts.length > 0 && (
                  <div className="px-4 py-2 border-b border-border bg-surface-2/30 flex items-center gap-2 flex-wrap">
                    <CheckCircle2 size={12} className="text-green-400" />
                    <span className="text-[11px] text-muted-foreground">Generated with</span>
                    <span className="text-[11px] text-foreground font-medium">{result.provider}</span>
                    {result.attempts.length > 1 && (
                      <span className="text-[10px] text-muted-foreground/60">
                        (fallback after {result.attempts.length - 1} {result.attempts.length - 1 === 1 ? 'attempt' : 'attempts'})
                      </span>
                    )}
                  </div>
                )}

                {/* Image */}
                {result.image ? (
                  <div className="relative">
                    <img src={result.image} alt={prompt} loading="lazy" decoding="async" className="w-full max-h-[600px] object-contain bg-background" />
                    <div className="absolute top-3 right-3 flex gap-1">
                      <button
                        onClick={() => downloadImage(result.image, prompt.slice(0, 30) || 'image')}
                        className="bg-background/80 backdrop-blur text-foreground p-2 rounded-lg hover:bg-background transition-colors"
                        title="Download"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={generate}
                        disabled={generating}
                        className="bg-background/80 backdrop-blur text-foreground p-2 rounded-lg hover:bg-background transition-colors"
                        title="Regenerate"
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <ImageIcon size={32} className="mx-auto text-muted-foreground/60 mb-2" />
                    <p className="text-muted-foreground text-sm">No image generated. Try a more descriptive prompt.</p>
                  </div>
                )}

                {result.text && (
                  <div className="px-4 py-3 border-t border-border">
                    <p className="text-foreground text-[12px]">{result.text}</p>
                  </div>
                )}
              </div>
            )}

            {/* Gallery */}
            {gallery.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider font-semibold">
                    Gallery ({gallery.length})
                  </p>
                  <p className="text-muted-foreground/60 text-[10px]">
                    Includes images from Cerebro
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {gallery.map((item) => (
                    <div
                      key={item.id}
                      className="bg-card border border-border rounded-lg overflow-hidden group relative hover:border-primary/40 transition-colors"
                    >
                      {item.url ? (
                        <img
                          src={item.url}
                          alt={item.prompt}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-32 object-cover cursor-pointer"
                          onClick={() => setResult({ image: item.url!, provider: item.provider || 'unknown', attempts: [] })}
                        />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center bg-background">
                          <ImageIcon size={24} className="text-muted-foreground/40" />
                        </div>
                      )}

                      {/* Hover actions */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.url && (
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadImage(item.url!, item.prompt.slice(0, 30) || 'image'); }}
                            className="bg-background/80 backdrop-blur text-foreground p-1.5 rounded hover:bg-background transition-colors"
                            title="Download"
                          >
                            <Download size={12} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteGalleryItem(item.id); }}
                          className="bg-background/80 backdrop-blur text-red-400 p-1.5 rounded hover:bg-background transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Source badge */}
                      <div className="absolute top-2 left-2">
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded font-medium backdrop-blur',
                          item.source === 'cerebro'
                            ? 'bg-primary/30 text-primary'
                            : 'bg-background/80 text-muted-foreground'
                        )}>
                          {item.source === 'cerebro' ? 'Cerebro' : 'Lab'}
                        </span>
                      </div>

                      <div className="px-3 py-2">
                        <p className="text-muted-foreground text-[11px] truncate">{item.prompt}</p>
                        <p className="text-muted-foreground/60 text-[10px] mt-0.5">{item.provider || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!result && !error && !generating && gallery.length === 0 && !galleryLoading && (
              <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
                <ImageIcon size={32} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground text-sm">Enter a prompt and click Generate to create an image</p>
                {configuredCount === 0 && !providersLoading && (
                  <p className="text-[11px] text-red-400 mt-2">
                    No providers configured. Add an API key to .env.local or Vercel.
                  </p>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
