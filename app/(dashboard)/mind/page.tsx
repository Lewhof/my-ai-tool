'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Brain, Sun, Moon, BookOpen, Flame, Sparkles, Plus, Loader2, X, Trash2,
  Quote, Check, Search, CheckCircle2, BookMarked, Edit3, Settings,
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
  why_it_matters: string;
  key_ideas: Array<{ concept: string; quote: string; when_to_apply: string }>;
  counter_arguments: string;
  action: string;
  avoidance: string;
  ultra_short: string;
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

type Tab = 'today' | 'library' | 'journal' | 'virtues';

export default function MindLibraryPage() {
  const [tab, setTab] = useState<Tab>('today');

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
            <p className="text-muted-foreground text-xs mt-0.5">Daily ritual, book summaries, reflection, virtue</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border">
          {([
            { id: 'today' as const, label: 'Today', icon: Sun },
            { id: 'library' as const, label: 'Library', icon: BookOpen },
            { id: 'journal' as const, label: 'Journal', icon: Edit3 },
            { id: 'virtues' as const, label: 'Virtues', icon: Flame },
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
        {tab === 'journal' && <JournalTab />}
        {tab === 'virtues' && <VirtuesTab />}
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
              <button
                onClick={() => onDelete(book.id)}
                className="ml-auto p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {summary ? (
        <>
          {/* Thesis */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Thesis</h3>
            <p className="text-foreground text-sm leading-relaxed">{summary.thesis}</p>
          </div>

          {/* Why it matters (personalized) */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles size={10} /> Why it matters for you
            </h3>
            <p className="text-foreground text-sm leading-relaxed">{summary.why_it_matters}</p>
          </div>

          {/* Personal review */}
          {book.personal_review && (
            <div className="bg-card border border-primary/30 rounded-xl p-5" style={{ background: 'var(--color-surface-2)' }}>
              <h3 className="text-[10px] text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                <Sparkles size={10} /> AI Personal Review
              </h3>
              <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{book.personal_review}</p>
            </div>
          )}

          {/* Key ideas */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Key Ideas</h3>
            <div className="space-y-4">
              {summary.key_ideas.map((idea, i) => (
                <div key={i} className="border-l-2 border-primary/40 pl-4">
                  <p className="text-foreground text-sm font-semibold">{idea.concept}</p>
                  <p className="text-foreground/80 text-xs italic mt-1">&ldquo;{idea.quote}&rdquo;</p>
                  <p className="text-muted-foreground text-[11px] mt-1">When to apply: {idea.when_to_apply}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Counter-arguments */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Counter-Arguments</h3>
            <p className="text-foreground text-sm leading-relaxed">{summary.counter_arguments}</p>
          </div>

          {/* Action + Avoidance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-card border border-green-500/30 rounded-xl p-5" style={{ background: 'var(--color-surface-2)' }}>
              <h3 className="text-[10px] text-green-400 uppercase tracking-wider mb-2">One thing to START</h3>
              <p className="text-foreground text-sm">{summary.action}</p>
            </div>
            <div className="bg-card border border-red-500/30 rounded-xl p-5" style={{ background: 'var(--color-surface-2)' }}>
              <h3 className="text-[10px] text-red-400 uppercase tracking-wider mb-2">One thing to STOP</h3>
              <p className="text-foreground text-sm">{summary.avoidance}</p>
            </div>
          </div>

          {/* Ultra-short */}
          <div className="bg-card border border-dashed border-border rounded-xl p-5">
            <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">3-sentence version</h3>
            <p className="text-foreground/80 text-sm italic">{summary.ultra_short}</p>
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
// JOURNAL TAB (reuses notes_v2 with category='practice')
// ═══════════════════════════════════════════════
function JournalTab() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-card border border-dashed border-border rounded-xl p-10 text-center">
        <Edit3 size={28} className="mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-foreground text-sm font-semibold">Reflection Journal</p>
        <p className="text-muted-foreground text-xs mt-1">
          Your morning reflections and evening reviews are automatically saved to this journal.
        </p>
        <p className="text-muted-foreground/60 text-[11px] mt-3">
          View them in the Today tab, or browse your full history in Notes.
        </p>
        <a
          href="/notes"
          className="inline-flex items-center gap-1.5 mt-4 text-primary text-xs hover:text-primary/80"
        >
          Open Notes
        </a>
      </div>
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
