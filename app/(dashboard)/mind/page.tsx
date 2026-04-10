'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Brain, Sun, Moon, BookOpen, Flame, Sparkles, Plus, Loader2, X, Trash2,
  Quote, Check, Search, CheckCircle2, BookMarked, Settings, Save, Tag,
  Copy, MessageSquareQuote, Pencil, Newspaper, ExternalLink, Clock, RefreshCw, Bookmark,
} from 'lucide-react';

interface DailyContent {
  date: string;
  week_theme: string;
  morning_content: string;
  evening_content: string;
  morning_response?: { reflection?: string; mood?: number; gratitude?: string[] };
  evening_response?: { wentWell?: string; fellShort?: string; tomorrow?: string };
  morning_completed_at?: string;
  evening_completed_at?: string;
}

interface Book {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  cover_url: string | null;
  status: 'want-to-read' | 'reading' | 'finished';
  rating: number | null;
  summary: BookSummary | null;
  personal_review: string | null;
  tags: string[];
  added_at: string;
}

interface BookSummary {
  thesis: string;
  overview?: string;
  key_ideas: Array<{ concept: string; explanation?: string; quote: string; when_to_apply?: string }>;
  notable_quotes?: string[];
  counter_arguments: string;
  ultra_short: string;
  relevance?: string;
  action: string;
  avoidance: string;
  why_it_matters?: string;
}

interface Highlight {
  id: string;
  content: string;
  source_type: string | null;
  source_title: string | null;
  tags: string[];
  last_reviewed_at: string | null;
  review_count: number;
}

interface VirtueDef {
  id: string;
  name: string;
  description: string | null;
  position: number;
  is_custom: boolean;
  active: boolean;
}

interface VirtueLog {
  id: string;
  virtue: string;
  day_date: string;
  score: number;
  note: string | null;
}

type Tab = 'today' | 'library' | 'quotes' | 'virtues' | 'news';

interface SearchSource {
  n: number;
  kind: 'highlight' | 'book';
  id: string;
  title: string;
  snippet: string;
}

interface SearchResult {
  answer: string;
  sources: SearchSource[];
  model_used: string;
  cached: boolean;
  searched: { highlights: number; books: number };
}

export default function MindLibraryPage() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab');
      if (t && ['today', 'library', 'quotes', 'virtues', 'news'].includes(t)) return t as Tab;
    }
    return 'today';
  });

  // Library search state (persistent across tabs)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchResult(null);
    setSearchOpen(true);
    try {
      const res = await fetch('/api/mind/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (res.ok) {
        setSearchResult(data);
      } else {
        toast.error(data.error || 'Search failed');
      }
    } catch {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const copyAnswer = () => {
    if (!searchResult?.answer) return;
    navigator.clipboard.writeText(searchResult.answer);
    toast.success('Copied to clipboard');
  };

  const saveAnswerAsNote = async () => {
    if (!searchResult?.answer) return;
    try {
      // 1. Create an empty note with a title
      const createRes = await fetch('/api/notes-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Mind search: ${searchQuery}` }),
      });
      if (!createRes.ok) throw new Error('create failed');
      const note = await createRes.json();

      // 2. PATCH with full content
      const content = `**Question:** ${searchQuery}\n\n${searchResult.answer}\n\n---\n\n**Sources (${searchResult.sources.length}):**\n${searchResult.sources.map(s => `[${s.n}] ${s.title}`).join('\n')}`;
      const patchRes = await fetch(`/api/notes-v2/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (patchRes.ok) toast.success('Saved to Notes');
      else toast.error('Note created but content not saved');
    } catch {
      toast.error('Save failed');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-brand)' }}>
            <Brain size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Mind Library</h2>
            <p className="text-muted-foreground text-xs mt-0.5">Daily ritual, book summaries, quotes, virtue</p>
          </div>
        </div>

        {/* Library search bar */}
        <div className="flex-1 min-w-0 max-w-md order-last md:order-none w-full md:w-auto">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Ask your library..."
              disabled={searching}
              className="w-full bg-background border border-border rounded-lg pl-8 pr-12 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
            {searching && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
            {!searching && searchQuery && (
              <button
                onClick={runSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary font-semibold px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20"
              >
                ⏎
              </button>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border">
          {([
            { id: 'today' as const, label: 'Today', icon: Sun },
            { id: 'library' as const, label: 'Library', icon: BookOpen },
            { id: 'quotes' as const, label: 'Quotes', icon: MessageSquareQuote },
            { id: 'virtues' as const, label: 'Virtues', icon: Flame },
            { id: 'news' as const, label: 'News', icon: Newspaper },
          ]).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors',
                  tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tab === 'today' && <TodayTab />}
        {tab === 'library' && <LibraryTab />}
        {tab === 'quotes' && <QuotesTab />}
        {tab === 'virtues' && <VirtuesTab />}
        {tab === 'news' && <NewsTab />}
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <SearchOverlay
          query={searchQuery}
          searching={searching}
          result={searchResult}
          onClose={() => { setSearchOpen(false); setSearchResult(null); }}
          onCopy={copyAnswer}
          onSave={saveAnswerAsNote}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// SEARCH OVERLAY
// ═══════════════════════════════════════════════
function SearchOverlay({
  query, searching, result, onClose, onCopy, onSave,
}: {
  query: string;
  searching: boolean;
  result: SearchResult | null;
  onClose: () => void;
  onCopy: () => void;
  onSave: () => void;
}) {
  // Render answer with inline citation chips
  const renderAnswer = (text: string) => {
    const parts = text.split(/(\[\^\d+\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[\^(\d+)\]$/);
      if (m) {
        return (
          <sup key={i} className="text-primary font-semibold text-[10px] bg-primary/10 rounded px-1 py-0.5 mx-0.5">
            {m[1]}
          </sup>
        );
      }
      return <span key={i}>{p}</span>;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={16} className="text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Library search</p>
              <p className="text-foreground text-sm font-semibold truncate">&ldquo;{query}&rdquo;</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {searching ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">Searching your library…</p>
            </div>
          ) : result ? (
            <>
              {/* Answer */}
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                  {renderAnswer(result.answer)}
                </p>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                  <button onClick={onCopy} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 border border-border rounded transition-colors">
                    <Copy size={10} /> Copy
                  </button>
                  <button onClick={onSave} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 border border-border rounded transition-colors">
                    <Save size={10} /> Save as note
                  </button>
                  <span className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded font-mono">{result.model_used}</span>
                    {result.cached && <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">cached</span>}
                  </span>
                </div>
              </div>

              {/* Sources */}
              {result.sources.length > 0 && (
                <div>
                  <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Sources ({result.sources.length})</h4>
                  <div className="space-y-2">
                    {result.sources.map((s) => (
                      <div key={`${s.kind}-${s.id}`} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
                        <span className="text-primary font-semibold text-[10px] bg-primary/10 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
                          {s.n}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground text-xs font-medium truncate">
                            {s.kind === 'highlight' ? '💬 ' : '📘 '}
                            {s.title}
                          </p>
                          <p className="text-muted-foreground text-[11px] mt-1 line-clamp-2 italic">&ldquo;{s.snippet}&rdquo;</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">No result yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TODAY TAB
// ═══════════════════════════════════════════════
function TodayTab() {
  const [daily, setDaily] = useState<DailyContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [morningReflection, setMorningReflection] = useState('');
  const [gratitude, setGratitude] = useState(['', '', '']);
  const [savingMorning, setSavingMorning] = useState(false);
  const [showEvening, setShowEvening] = useState(false);
  const [wentWell, setWentWell] = useState('');
  const [fellShort, setFellShort] = useState('');
  const [tomorrow, setTomorrow] = useState('');
  const [savingEvening, setSavingEvening] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dailyRes, highlightsRes] = await Promise.all([
        fetch('/api/practice/daily'),
        fetch('/api/highlights?mode=today'),
      ]);
      if (dailyRes.ok) {
        const d = await dailyRes.json();
        setDaily(d);
        if (d.morning_response?.reflection) setMorningReflection(d.morning_response.reflection);
        if (d.morning_response?.gratitude) setGratitude([...d.morning_response.gratitude, '', '', ''].slice(0, 3));
        if (d.evening_response?.wentWell) setWentWell(d.evening_response.wentWell);
        if (d.evening_response?.fellShort) setFellShort(d.evening_response.fellShort);
        if (d.evening_response?.tomorrow) setTomorrow(d.evening_response.tomorrow);
      }
      if (highlightsRes.ok) {
        const h = await highlightsRes.json();
        setHighlights(h.highlights || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveMorning = async () => {
    if (!daily) return;
    setSavingMorning(true);
    await fetch('/api/practice/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: daily.date,
        type: 'morning',
        response: { reflection: morningReflection, gratitude: gratitude.filter(Boolean) },
      }),
    });
    toast.success('Morning reflection saved');
    setSavingMorning(false);
    load();
  };

  const saveEvening = async () => {
    if (!daily) return;
    setSavingEvening(true);
    await fetch('/api/practice/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: daily.date,
        type: 'evening',
        response: { wentWell, fellShort, tomorrow },
      }),
    });
    toast.success('Evening review saved');
    setSavingEvening(false);
    load();
  };

  const reviewHighlight = async (id: string) => {
    await fetch('/api/highlights', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'review' }),
    });
    setHighlights(prev => prev.filter(h => h.id !== id));
  };

  const now = new Date();
  const isEveningTime = now.getHours() >= 17;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={24} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading today&apos;s content...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Virtue badge */}
      {daily?.week_theme && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Flame size={12} className="text-orange-400" />
          <span>This week&apos;s virtue:</span>
          <span className="text-foreground font-semibold">{daily.week_theme}</span>
        </div>
      )}

      {/* Morning Card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2" style={{ background: 'var(--color-surface-2)' }}>
          <Sun size={14} className="text-yellow-400" />
          <h3 className="text-foreground font-semibold text-sm">Morning Reflection</h3>
          {daily?.morning_completed_at && (
            <span className="ml-auto text-[10px] text-green-400 flex items-center gap-1">
              <Check size={10} />
              Saved
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{daily?.morning_content}</p>

          <div className="pt-3 border-t border-border space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Your reflection</label>
              <textarea
                value={morningReflection}
                onChange={(e) => setMorningReflection(e.target.value)}
                placeholder="Answer the question above..."
                rows={3}
                className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider">3 things I&apos;m grateful for</label>
              <div className="space-y-1.5 mt-1">
                {[0, 1, 2].map(i => (
                  <input
                    key={i}
                    value={gratitude[i] || ''}
                    onChange={(e) => setGratitude(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                    placeholder={`${i + 1}.`}
                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={saveMorning}
                disabled={savingMorning}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingMorning ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights resurfacing */}
      {highlights.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2" style={{ background: 'var(--color-surface-2)' }}>
            <Quote size={14} className="text-primary" />
            <h3 className="text-foreground font-semibold text-sm">Today&apos;s Highlights</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">{highlights.length} to review</span>
          </div>
          <div className="divide-y divide-border">
            {highlights.map(h => (
              <div key={h.id} className="px-5 py-4 flex items-start gap-3 group hover:bg-surface-2/30 transition-colors">
                <Quote size={14} className="text-muted-foreground/40 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm italic">&ldquo;{h.content}&rdquo;</p>
                  {h.source_title && (
                    <p className="text-muted-foreground text-[11px] mt-1">— {h.source_title}</p>
                  )}
                </div>
                <button
                  onClick={() => reviewHighlight(h.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-green-400 transition-all"
                  title="Mark reviewed"
                >
                  <CheckCircle2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evening Review (show after 17:00 or on click) */}
      {(isEveningTime || showEvening) ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2" style={{ background: 'var(--color-surface-2)' }}>
            <Moon size={14} className="text-blue-400" />
            <h3 className="text-foreground font-semibold text-sm">Evening Review</h3>
            {daily?.evening_completed_at && (
              <span className="ml-auto text-[10px] text-green-400 flex items-center gap-1">
                <Check size={10} />
                Saved
              </span>
            )}
          </div>
          <div className="p-5 space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{daily?.evening_content}</p>

            <div className="pt-3 border-t border-border space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider">What went well?</label>
                <textarea
                  value={wentWell}
                  onChange={(e) => setWentWell(e.target.value)}
                  rows={2}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Where did you fall short?</label>
                <textarea
                  value={fellShort}
                  onChange={(e) => setFellShort(e.target.value)}
                  rows={2}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Tomorrow, I will...</label>
                <textarea
                  value={tomorrow}
                  onChange={(e) => setTomorrow(e.target.value)}
                  rows={2}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={saveEvening}
                  disabled={savingEvening}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingEvening ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Save Review
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowEvening(true)}
          className="w-full bg-card border border-dashed border-border rounded-xl px-5 py-4 flex items-center justify-center gap-2 text-muted-foreground text-sm hover:text-foreground hover:border-border/80 transition-colors"
        >
          <Moon size={14} />
          Evening review available after 5pm — or click to open now
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// LIBRARY TAB
// ═══════════════════════════════════════════════
function LibraryTab() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'want-to-read' | 'reading' | 'finished'>('all');
  const [query, setQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/books');
      if (res.ok) {
        const data = await res.json();
        setBooks(data.books || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const generateBook = async () => {
    if (!query.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/books/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Added "${data.book.title}"`);
        setQuery('');
        load();
        setSelectedBook(data.book);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to generate summary');
      }
    } catch {
      toast.error('Generation failed');
    }
    setGenerating(false);
  };

  const setStatus = async (id: string, status: Book['status']) => {
    await fetch('/api/books', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    load();
  };

  const deleteBook = async (id: string) => {
    if (!confirm('Delete this book?')) return;
    await fetch(`/api/books?id=${id}`, { method: 'DELETE' });
    setBooks(prev => prev.filter(b => b.id !== id));
    if (selectedBook?.id === id) setSelectedBook(null);
  };

  const filtered = filter === 'all' ? books : books.filter(b => b.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Add book */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') generateBook(); }}
            placeholder="Book title or title + author (e.g. Atomic Habits James Clear)"
            className="flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground/50"
            disabled={generating}
          />
          <button
            onClick={generateBook}
            disabled={generating || !query.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {generating ? 'Generating...' : 'AI Summarize'}
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border w-fit">
        {(['all', 'reading', 'want-to-read', 'finished'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1 text-[11px] font-medium rounded-md transition-colors',
              filter === f ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f === 'want-to-read' ? 'Want to Read' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Book grid */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-10 text-center">
          <BookOpen size={28} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-muted-foreground text-sm">No books yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Search above to add your first book with an AI summary</p>
        </div>
      ) : selectedBook ? (
        <BookDetail book={selectedBook} onBack={() => setSelectedBook(null)} onStatusChange={setStatus} onDelete={deleteBook} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(book => (
            <button
              key={book.id}
              onClick={() => setSelectedBook(book)}
              className="bg-card border border-border rounded-xl p-4 text-left hover:border-border/60 transition-colors"
            >
              <div className="flex items-start gap-3">
                {book.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={book.cover_url} alt={book.title} className="w-12 h-16 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-12 h-16 rounded bg-secondary flex items-center justify-center shrink-0">
                    <BookMarked size={14} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-semibold truncate">{book.title}</p>
                  {book.author && <p className="text-muted-foreground text-[11px] mt-0.5">{book.author}</p>}
                  <span className={cn(
                    'inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded',
                    book.status === 'finished' ? 'bg-green-500/10 text-green-400' :
                    book.status === 'reading' ? 'bg-blue-500/10 text-blue-400' :
                    'bg-muted/30 text-muted-foreground'
                  )}>
                    {book.status === 'want-to-read' ? 'Want to Read' : book.status.charAt(0).toUpperCase() + book.status.slice(1)}
                  </span>
                </div>
              </div>
              {book.summary?.thesis && (
                <p className="text-muted-foreground text-xs mt-3 line-clamp-2">{book.summary.thesis}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BookDetail({ book, onBack, onStatusChange, onDelete }: {
  book: Book;
  onBack: () => void;
  onStatusChange: (id: string, status: Book['status']) => void;
  onDelete: (id: string) => void;
}) {
  const summary = book.summary;
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const [isReading, setIsReading] = useState(false);

  const buildSummaryText = (): string => {
    if (!summary) return '';
    const parts: string[] = [];
    parts.push(`Core Thesis. ${summary.thesis}`);
    if (summary.overview) {
      parts.push(`Book Overview. ${summary.overview}`);
    } else if (summary.why_it_matters) {
      parts.push(`Overview. ${summary.why_it_matters}`);
    }
    if (summary.key_ideas?.length) {
      parts.push('Key Ideas.');
      summary.key_ideas.forEach((idea, i) => {
        parts.push(`Idea ${i + 1}: ${idea.concept}. ${idea.explanation || idea.when_to_apply || ''} Quote: ${idea.quote}.`);
      });
    }
    if (summary.notable_quotes?.length) {
      parts.push('Notable Quotes.');
      summary.notable_quotes.forEach(q => parts.push(q));
    }
    parts.push(`Criticisms and Counterpoints. ${summary.counter_arguments}`);
    parts.push(`TL;DR. ${summary.ultra_short}`);
    return parts.join('\n\n');
  };

  const toggleReadAloud = () => {
    if (isReading) {
      window.speechSynthesis.cancel();
      setIsReading(false);
      return;
    }
    const text = buildSummaryText();
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.lang = 'en-ZA';
    utterance.onend = () => setIsReading(false);
    utterance.onerror = () => setIsReading(false);
    window.speechSynthesis.speak(utterance);
    setIsReading(true);
  };

  // Cleanup on unmount
  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  const saveKeyIdeaAsHighlight = async (idx: number, idea: { concept: string; quote: string }) => {
    const tag = idea.concept.toLowerCase().replace(/\s+/g, '-').slice(0, 40);
    const res = await fetch('/api/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: idea.quote,
        source_type: 'book',
        source_id: book.id,
        source_title: book.title,
        tags: [tag],
      }),
    });
    if (res.ok) {
      setSavedIdx(prev => new Set(prev).add(idx));
      toast.success('Saved to Quotes');
    } else {
      toast.error('Failed to save');
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-muted-foreground hover:text-foreground text-xs">
        &larr; Back to library
      </button>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-4">
          {book.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.cover_url} alt={book.title} className="w-20 h-28 object-cover rounded shrink-0" />
          ) : (
            <div className="w-20 h-28 rounded bg-secondary flex items-center justify-center shrink-0">
              <BookMarked size={20} className="text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-foreground text-lg font-bold">{book.title}</h2>
            {book.author && <p className="text-muted-foreground text-sm mt-0.5">{book.author}</p>}
            <div className="flex items-center gap-2 mt-3">
              {(['want-to-read', 'reading', 'finished'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => onStatusChange(book.id, s)}
                  className={cn(
                    'text-[11px] px-2 py-1 rounded border transition-colors',
                    book.status === s
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {s === 'want-to-read' ? 'Want to Read' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              {summary && (
                <button
                  onClick={toggleReadAloud}
                  className={cn(
                    'ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors',
                    isReading
                      ? 'border-primary/50 text-primary bg-primary/10'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  {isReading ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                      Stop
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                      Read aloud
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => onDelete(book.id)}
                className={cn(summary ? '' : 'ml-auto', 'p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {summary ? (
        <>
          {/* ── OBJECTIVE SUMMARY ── */}

          {/* Core Thesis */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Core Thesis</h3>
            <p className="text-foreground text-base font-medium leading-relaxed">{summary.thesis}</p>
          </div>

          {/* Book Overview */}
          {summary.overview ? (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Book Overview</h3>
              <p className="text-foreground/90 text-sm leading-[1.8] whitespace-pre-wrap">{summary.overview}</p>
            </div>
          ) : summary.why_it_matters && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Overview</h3>
              <p className="text-foreground/90 text-sm leading-relaxed">{summary.why_it_matters}</p>
            </div>
          )}

          {/* Key Ideas */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-4">Key Ideas</h3>
            <div className="space-y-5">
              {summary.key_ideas.map((idea, i) => {
                const saved = savedIdx.has(i);
                return (
                  <div key={i} className="border-l-2 border-primary/40 pl-4 group">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-primary/60 font-bold">{i + 1}</span>
                      <p className="text-foreground text-sm font-semibold">{idea.concept}</p>
                    </div>
                    {/* Explanation (new) or when_to_apply (legacy) */}
                    {idea.explanation && (
                      <p className="text-foreground/80 text-[13px] leading-[1.7] mb-2">{idea.explanation}</p>
                    )}
                    {!idea.explanation && idea.when_to_apply && (
                      <p className="text-muted-foreground text-[12px] mb-2">When to apply: {idea.when_to_apply}</p>
                    )}
                    <div className="flex items-start gap-2">
                      <p className="text-foreground/60 text-xs italic flex-1 border-l border-border/50 pl-3">&ldquo;{idea.quote}&rdquo;</p>
                      <button
                        onClick={() => saveKeyIdeaAsHighlight(i, idea)}
                        disabled={saved}
                        title={saved ? 'Saved to Quotes' : 'Save as quote'}
                        className={cn(
                          'shrink-0 p-1 rounded transition-all',
                          saved
                            ? 'text-green-400 cursor-default'
                            : 'text-muted-foreground/40 hover:text-primary opacity-0 group-hover:opacity-100'
                        )}
                      >
                        {saved ? <CheckCircle2 size={12} /> : <Save size={12} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notable Quotes */}
          {summary.notable_quotes && summary.notable_quotes.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Notable Quotes</h3>
              <div className="space-y-3">
                {summary.notable_quotes.map((q, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Quote size={12} className="text-primary/30 shrink-0 mt-0.5" />
                    <p className="text-foreground/70 text-sm italic leading-relaxed">{q}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Criticisms & Counterpoints */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Criticisms &amp; Counterpoints</h3>
            <p className="text-foreground/80 text-sm leading-[1.7]">{summary.counter_arguments}</p>
          </div>

          {/* TL;DR */}
          <div className="bg-card border border-dashed border-border rounded-xl p-5">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">TL;DR</h3>
            <p className="text-foreground/70 text-sm italic leading-relaxed">{summary.ultra_short}</p>
          </div>

          {/* ── PERSONAL RELEVANCE (bottom) ── */}
          <div className="border-t border-border pt-4 mt-2">
            <h3 className="text-[10px] text-primary/70 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles size={10} /> Personal Application
            </h3>

            {/* Relevance */}
            {(summary.relevance || summary.why_it_matters) && (
              <div className="bg-card border border-primary/20 rounded-xl p-5 mb-3" style={{ background: 'var(--color-surface-2)' }}>
                <h4 className="text-[10px] text-primary/50 uppercase tracking-wider mb-2">Why this matters for you</h4>
                <p className="text-foreground/80 text-sm leading-relaxed">{summary.relevance || summary.why_it_matters}</p>
              </div>
            )}

            {/* AI Personal Review */}
            {book.personal_review && (
              <div className="bg-card border border-primary/20 rounded-xl p-5 mb-3" style={{ background: 'var(--color-surface-2)' }}>
                <h4 className="text-[10px] text-primary/50 uppercase tracking-wider mb-2">AI Review for You</h4>
                <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-wrap">{book.personal_review}</p>
              </div>
            )}

            {/* Action + Avoidance */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-card border border-green-500/20 rounded-xl p-4" style={{ background: 'var(--color-surface-2)' }}>
                <h4 className="text-[10px] text-green-400/80 uppercase tracking-wider mb-1.5">Start doing</h4>
                <p className="text-foreground/80 text-sm">{summary.action}</p>
              </div>
              <div className="bg-card border border-red-500/20 rounded-xl p-4" style={{ background: 'var(--color-surface-2)' }}>
                <h4 className="text-[10px] text-red-400/80 uppercase tracking-wider mb-1.5">Stop doing</h4>
                <p className="text-foreground/80 text-sm">{summary.avoidance}</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">No AI summary available</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// QUOTES TAB
// ═══════════════════════════════════════════════
function QuotesTab() {
  const [quotes, setQuotes] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'book' | 'manual' | 'article' | 'web_clip'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  // Add form state
  const [newContent, setNewContent] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newTags, setNewTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');

  // Bulk-from-books banner
  const [showBulkBanner, setShowBulkBanner] = useState(true);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bookCount, setBookCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/highlights?limit=300');
      if (res.ok) {
        const data = await res.json();
        setQuotes(data.highlights || []);
      }
      // Check how many books the user has to decide bulk-import banner visibility
      const bRes = await fetch('/api/books');
      if (bRes.ok) {
        const bData = await bRes.json();
        setBookCount((bData.books || []).length);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addQuote = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    const tagsArr = newTags.split(',').map(t => t.trim()).filter(Boolean);
    const res = await fetch('/api/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: newContent.trim(),
        source_type: 'manual',
        source_title: newSource.trim() || null,
        tags: tagsArr,
      }),
    });
    if (res.ok) {
      toast.success('Quote saved');
      setNewContent('');
      setNewSource('');
      setNewTags('');
      setShowAdd(false);
      load();
    } else {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  const deleteQuote = async (id: string) => {
    if (!confirm('Delete this quote?')) return;
    await fetch(`/api/highlights?id=${id}`, { method: 'DELETE' });
    setQuotes(prev => prev.filter(q => q.id !== id));
    toast.success('Deleted');
  };

  const reviewQuote = async (id: string) => {
    await fetch('/api/highlights', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'review' }),
    });
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, review_count: q.review_count + 1, last_reviewed_at: new Date().toISOString() } : q));
  };

  const copyQuote = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied');
  };

  const startEdit = (q: Highlight) => {
    setEditingId(q.id);
    setEditContent(q.content);
    setEditTags((q.tags || []).join(', '));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const tagsArr = editTags.split(',').map(t => t.trim()).filter(Boolean);
    const res = await fetch('/api/highlights', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, content: editContent, tags: tagsArr }),
    });
    if (res.ok) {
      toast.success('Updated');
      setEditingId(null);
      load();
    }
  };

  const importFromBooks = async () => {
    setBulkImporting(true);
    const res = await fetch('/api/highlights?mode=from-books', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      if (data.added > 0) {
        toast.success(`Imported ${data.added} quote${data.added === 1 ? '' : 's'} from your books${data.skipped ? ` (${data.skipped} already existed)` : ''}`);
      } else {
        toast(data.message || 'Nothing new to import');
      }
      setShowBulkBanner(false);
      load();
    } else {
      toast.error(data.error || 'Import failed');
    }
    setBulkImporting(false);
  };

  // Derived data
  const allTags = Array.from(new Set(quotes.flatMap(q => q.tags || []))).sort();
  const filtered = quotes.filter(q => {
    if (sourceFilter !== 'all' && q.source_type !== sourceFilter) return false;
    if (tagFilter && !(q.tags || []).includes(tagFilter)) return false;
    if (clientSearch.trim()) {
      const q_ = clientSearch.toLowerCase();
      if (!q.content.toLowerCase().includes(q_) && !(q.source_title || '').toLowerCase().includes(q_)) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {/* Bulk import banner — only if user has books AND empty/low highlights */}
      {showBulkBanner && bookCount > 0 && quotes.length < 5 && !loading && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
          <Sparkles size={16} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-foreground text-sm font-medium">You have {bookCount} book{bookCount === 1 ? '' : 's'} with key quotes already summarized</p>
            <p className="text-muted-foreground text-xs">Import every key quote from your library as a highlight (deduped).</p>
          </div>
          <button
            onClick={importFromBooks}
            disabled={bulkImporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
          >
            {bulkImporting ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Import
          </button>
          <button
            onClick={() => setShowBulkBanner(false)}
            className="text-muted-foreground/60 hover:text-foreground p-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={12} />
          Add quote
        </button>

        {/* Source filter */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border">
          {(['all', 'book', 'manual', 'article', 'web_clip'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors',
                sourceFilter === s ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {s === 'all' ? 'All' : s === 'web_clip' ? 'Web clip' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Client search */}
        <div className="relative flex-1 min-w-[140px] max-w-[240px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            placeholder="Filter quotes…"
            className="w-full bg-background border border-border rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <span className="text-muted-foreground text-[11px] ml-auto">{filtered.length} of {quotes.length}</span>
      </div>

      {/* Tag chips */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag size={11} className="text-muted-foreground/60" />
          <button
            onClick={() => setTagFilter(null)}
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
              !tagFilter ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-border hover:text-foreground'
            )}
          >
            All tags
          </button>
          {allTags.slice(0, 20).map(t => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                tagFilter === t ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-border hover:text-foreground'
              )}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="The quote itself..."
            rows={3}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2 flex-wrap">
            <input
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              placeholder="Source (e.g. Meditations — Marcus Aurelius)"
              className="flex-1 min-w-[200px] bg-background border border-border rounded-lg px-3 py-1.5 text-foreground text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="tags, comma, separated"
              className="flex-1 min-w-[160px] bg-background border border-border rounded-lg px-3 py-1.5 text-foreground text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground text-xs px-3 py-1.5">Cancel</button>
            <button
              onClick={addQuote}
              disabled={saving || !newContent.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
          <Quote size={28} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-foreground text-sm font-semibold">
            {quotes.length === 0 ? 'No quotes yet' : 'No quotes match your filters'}
          </p>
          {quotes.length === 0 && (
            <p className="text-muted-foreground text-xs mt-1">
              Add a quote manually, or import every key quote from your book library.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(q => (
            <div key={q.id} className="bg-card border border-border rounded-xl p-4 group hover:border-border/80 transition-colors">
              {editingId === q.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="tags, comma, separated"
                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground text-xs px-3 py-1">Cancel</button>
                    <button onClick={saveEdit} className="flex items-center gap-1.5 px-3 py-1 rounded text-xs bg-primary text-foreground font-medium">
                      <Save size={11} />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <Quote size={14} className="text-muted-foreground/40 shrink-0 mt-0.5" />
                    <p className="text-foreground text-sm italic flex-1 min-w-0 leading-relaxed">&ldquo;{q.content}&rdquo;</p>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
                      <button onClick={() => reviewQuote(q.id)} title="Mark reviewed" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-green-400">
                        <CheckCircle2 size={12} />
                      </button>
                      <button onClick={() => copyQuote(q.content)} title="Copy" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                        <Copy size={12} />
                      </button>
                      <button onClick={() => startEdit(q)} title="Edit" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => deleteQuote(q.id)} title="Delete" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap pl-6">
                    {q.source_title && <span className="text-muted-foreground text-[11px]">— {q.source_title}</span>}
                    {q.source_type && q.source_type !== 'manual' && (
                      <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{q.source_type}</span>
                    )}
                    {(q.tags || []).map(t => (
                      <button
                        key={t}
                        onClick={() => setTagFilter(t)}
                        className="text-[10px] text-primary/80 hover:text-primary"
                      >
                        #{t}
                      </button>
                    ))}
                    {q.review_count > 0 && (
                      <span className="ml-auto text-[10px] text-muted-foreground/60">Reviewed {q.review_count}×</span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// VIRTUES TAB
// ═══════════════════════════════════════════════
function VirtuesTab() {
  const [definitions, setDefinitions] = useState<VirtueDef[]>([]);
  const [current, setCurrent] = useState<{ name: string; position: number } | null>(null);
  const [logs, setLogs] = useState<VirtueLog[]>([]);
  const [quarterLogs, setQuarterLogs] = useState<VirtueLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManage, setShowManage] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [weekRes, qtrRes] = await Promise.all([
        fetch('/api/virtues'),
        fetch('/api/virtues?mode=quarter'),
      ]);
      if (weekRes.ok) {
        const d = await weekRes.json();
        setDefinitions(d.definitions || []);
        setCurrent(d.current);
        setLogs(d.logs || []);
      }
      if (qtrRes.ok) {
        const d = await qtrRes.json();
        setQuarterLogs(d.logs || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const logScore = async (score: number) => {
    if (!current) return;
    await fetch('/api/virtues', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'log', virtue: current.name, score }),
    });
    toast.success(`${current.name}: ${score}/5`);
    load();
  };

  const addVirtue = async () => {
    if (!newName.trim()) return;
    await fetch('/api/virtues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDescription }),
    });
    setNewName('');
    setNewDescription('');
    toast.success('Virtue added');
    load();
  };

  const toggleVirtue = async (v: VirtueDef) => {
    await fetch('/api/virtues', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: v.id, active: !v.active }),
    });
    load();
  };

  const deleteVirtue = async (id: string) => {
    if (!confirm('Delete this virtue? This cannot be undone.')) return;
    await fetch(`/api/virtues?id=${id}`, { method: 'DELETE' });
    load();
  };

  const today = new Date().toISOString().split('T')[0];
  const todayLog = logs.find(l => l.day_date === today);

  // Build quarter heatmap: last 13 weeks (91 days)
  const days: Array<{ date: string; score: number | null }> = [];
  for (let i = 90; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const log = quarterLogs.find(l => l.day_date === dateStr);
    days.push({ date: dateStr, score: log?.score ?? null });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* This week's virtue */}
      {current && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider">This Week&apos;s Virtue</h3>
              <h2 className="text-foreground text-2xl font-bold mt-1 flex items-center gap-2">
                <Flame size={20} className="text-orange-400" />
                {current.name}
              </h2>
              {definitions.find(d => d.name === current.name)?.description && (
                <p className="text-muted-foreground text-sm mt-2">{definitions.find(d => d.name === current.name)?.description}</p>
              )}
            </div>
            <button
              onClick={() => setShowManage(!showManage)}
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Manage virtues"
            >
              <Settings size={14} />
            </button>
          </div>

          {/* Today's score */}
          <div className="pt-4 border-t border-border">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
              Today&apos;s self-rating {todayLog && `(${todayLog.score}/5)`}
            </p>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => logScore(n)}
                  className={cn(
                    'w-10 h-10 rounded-lg border text-sm font-semibold transition-colors',
                    todayLog?.score === n
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1.5">
              1 = didn&apos;t practice · 5 = embodied fully
            </p>
          </div>

          {/* This week's scores */}
          {logs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">This week</p>
              <div className="flex items-center gap-1.5">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                  const weekStart = new Date();
                  const dayOfWeek = weekStart.getDay();
                  const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                  weekStart.setDate(diff + i);
                  const dateStr = weekStart.toISOString().split('T')[0];
                  const log = logs.find(l => l.day_date === dateStr);
                  return (
                    <div key={day} className="flex-1 text-center">
                      <div
                        className={cn(
                          'h-8 rounded flex items-center justify-center text-[10px] font-medium',
                          log ? 'text-foreground' : 'text-muted-foreground/40'
                        )}
                        style={{
                          background: log
                            ? `oklch(0.55 ${0.08 + log.score * 0.04} 25 / ${0.3 + log.score * 0.14})`
                            : 'var(--color-surface-2)',
                        }}
                      >
                        {log?.score ?? '—'}
                      </div>
                      <p className="text-[9px] text-muted-foreground/60 mt-1">{day}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quarterly heatmap */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Last 90 Days</h3>
        <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1">
          {days.map((d, i) => (
            <div
              key={i}
              className="aspect-square rounded-sm"
              title={`${d.date}${d.score ? ` — ${d.score}/5` : ''}`}
              style={{
                background: d.score
                  ? `oklch(0.55 ${0.08 + d.score * 0.04} 25 / ${0.3 + d.score * 0.14})`
                  : 'var(--color-surface-2)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Manage virtues */}
      {showManage && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold text-sm">Manage Virtues</h3>
            <button onClick={() => setShowManage(false)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>

          {/* Add custom */}
          <div className="bg-background border border-dashed border-border rounded-lg p-3 mb-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Add Custom Virtue</p>
            <div className="space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Virtue name (e.g. Resilience)"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="One-sentence description (optional)"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-end">
                <button
                  onClick={addVirtue}
                  disabled={!newName.trim()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-primary text-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Plus size={11} />
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Existing list */}
          <div className="space-y-1.5">
            {definitions.map(v => (
              <div key={v.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-2/50 group">
                <span className="text-muted-foreground/60 text-[10px] w-6 tabular-nums">#{v.position}</span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', v.active ? 'text-foreground' : 'text-muted-foreground line-through')}>
                    {v.name}
                    {v.is_custom && <span className="text-[9px] text-primary ml-1.5">custom</span>}
                  </p>
                  {v.description && (
                    <p className="text-muted-foreground/60 text-[11px] truncate">{v.description}</p>
                  )}
                </div>
                <button
                  onClick={() => toggleVirtue(v)}
                  className="text-muted-foreground hover:text-foreground text-[10px] px-2 py-1 rounded border border-border opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {v.active ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => deleteVirtue(v.id)}
                  className="text-muted-foreground hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// NEWS TAB
// ═══════════════════════════════════════════════

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  description: string;
}

type NewsCategory = 'top' | 'business' | 'tech' | 'world';

function NewsTab() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<NewsCategory>('top');
  const [saving, setSaving] = useState<string | null>(null);

  const fetchNews = useCallback(async (cat: NewsCategory, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`/api/news?category=${cat}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles ?? []);
      }
    } catch {
      toast.error('Failed to load news');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchNews(category); }, [category, fetchNews]);

  const saveAsHighlight = async (article: NewsArticle) => {
    setSaving(article.id);
    try {
      await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `${article.title}\n\n${article.description}\n\nSource: ${article.source}\nURL: ${article.url}`,
          source_type: 'article',
          source_title: article.source,
          tags: ['news', category],
        }),
      });
      toast.success('Saved to highlights');
    } catch {
      toast.error('Failed to save');
    }
    setSaving(null);
  };

  function timeAgo(dateStr: string): string {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      return `${Math.floor(hours / 24)}d ago`;
    } catch {
      return '';
    }
  }

  const categories: Array<{ id: NewsCategory; label: string }> = [
    { id: 'top', label: 'Top Stories' },
    { id: 'business', label: 'Business' },
    { id: 'tech', label: 'Technology' },
    { id: 'world', label: 'World' },
  ];

  return (
    <div className="p-6">
      {/* Category filters + refresh */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-1.5 p-0.5 rounded-lg border border-border">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                'px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors',
                category === c.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => fetchNews(category, true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      {/* Articles */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 size={20} className="animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading news...</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Newspaper size={32} className="text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">No news available</p>
        </div>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => (
            <div
              key={article.id}
              className="group flex items-start gap-4 p-4 rounded-xl border border-border hover:border-border/60 transition-all"
              style={{ background: 'var(--color-surface-1)' }}
            >
              <div className="flex-1 min-w-0">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground font-medium text-sm leading-snug hover:text-primary transition-colors line-clamp-2"
                >
                  {article.title}
                </a>
                {article.description && (
                  <p className="text-muted-foreground/70 text-xs mt-1.5 line-clamp-2 leading-relaxed">
                    {article.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  {article.source && (
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {article.source}
                    </span>
                  )}
                  {article.publishedAt && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50">
                      <Clock size={8} />
                      {timeAgo(article.publishedAt)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => saveAsHighlight(article)}
                  disabled={saving === article.id}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Save to highlights"
                >
                  {saving === article.id ? <Loader2 size={14} className="animate-spin" /> : <Bookmark size={14} />}
                </button>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Open article"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
