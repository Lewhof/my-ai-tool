import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, pickModel } from '@/lib/anthropic';
import { hashInput, getCached, setCached } from '@/lib/ai-cache';

// POST /api/mind/search
//   body: { query: string }
//
// Flow:
//   1. 24h exact-match cache hit → return immediately
//   2. Haiku expands query to 5-8 search keywords (separately cached)
//   3. Full-text search against highlights.search_vector (ts_rank ordered)
//   4. ILIKE search against books.title/author/summary::text
//   5. Sonnet synthesizes a cited answer from top 8 highlights + top 4 books
//   6. Citation validation: strip any [^N] that doesn't map to a real source index
//   7. Cache answer for 24h
//   8. Return { answer, sources, model_used, cached }

type ExpandedKeywords = { keywords: string[] };

type HighlightHit = {
  id: string;
  content: string;
  source_type: string | null;
  source_id: string | null;
  source_title: string | null;
  tags: string[] | null;
  rank: number;
};

type BookHit = {
  id: string;
  title: string;
  author: string | null;
  summary: Record<string, unknown> | null;
};

type Source = {
  n: number;           // citation number
  kind: 'highlight' | 'book';
  id: string;
  title: string;
  snippet: string;
};

type AnswerResult = {
  answer: string;
  sources: Source[];
  model_used: string;
  cached: boolean;
  searched: { highlights: number; books: number };
};

async function expandKeywords(query: string): Promise<string[]> {
  const cacheKey = hashInput({ scope: 'mind.expand', query: query.toLowerCase().trim() });
  const cached = await getCached<ExpandedKeywords>('search.expand', cacheKey);
  if (cached?.keywords) return cached.keywords;

  try {
    const response = await anthropic.messages.create({
      model: pickModel('search-expand'),
      max_tokens: 200,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Expand this concept into 5-8 search keywords for a full-text search of a personal philosophy/self-improvement library. Return ONLY a JSON object like {"keywords":["word1","word2"]}. No commentary.

Concept: ${query}`,
      }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [query];
    const parsed = JSON.parse(jsonMatch[0]) as ExpandedKeywords;
    const kws = (parsed.keywords || []).filter((k) => typeof k === 'string' && k.trim()).slice(0, 8);
    if (kws.length === 0) return [query];
    // Store for 7 days — keyword expansion is stable
    await setCached('search.expand', cacheKey, { keywords: kws }, 7 * 86400);
    return kws;
  } catch {
    return [query];
  }
}

function toTsQuery(keywords: string[]): string {
  // Build a tsquery string like: word1:* | word2:* | word3:*
  // Escape single quotes and drop non-alphanumerics to keep it safe.
  return keywords
    .map((k) => k.replace(/['"\\]/g, '').trim().split(/\s+/).filter(Boolean).join(' & '))
    .filter(Boolean)
    .map((k) => `(${k})`)
    .join(' | ');
}

function snippet(text: string, keywords: string[], max = 240): string {
  const lower = text.toLowerCase();
  for (const k of keywords) {
    const idx = lower.indexOf(k.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + 180);
      return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    }
  }
  return text.slice(0, max) + (text.length > max ? '…' : '');
}

function validateCitations(answer: string, maxIndex: number): string {
  // Strip any [^N] where N > maxIndex or N <= 0
  return answer.replace(/\[\^(\d+)\]/g, (match, n) => {
    const num = parseInt(n, 10);
    if (num >= 1 && num <= maxIndex) return match;
    return '';
  });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  let body: { query?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const rawQuery = (body.query || '').trim();
  if (!rawQuery) return Response.json({ error: 'query required' }, { status: 400 });
  if (rawQuery.length > 400) return Response.json({ error: 'query too long' }, { status: 400 });

  // Per-user answer cache (24h)
  const answerKey = hashInput({ scope: 'mind.answer', user: userId, q: rawQuery.toLowerCase() });
  const cachedAnswer = await getCached<AnswerResult>('search.expand', answerKey);
  if (cachedAnswer) {
    return Response.json({ ...cachedAnswer, cached: true });
  }

  // 1. Expand
  const keywords = await expandKeywords(rawQuery);

  // 2. Search highlights via FTS
  const tsq = toTsQuery([rawQuery, ...keywords]);
  let highlights: HighlightHit[] = [];
  try {
    const { data } = await supabaseAdmin.rpc('highlights_search', {
      p_user_id: userId,
      p_query: tsq,
      p_limit: 8,
    });
    if (Array.isArray(data)) {
      highlights = data as HighlightHit[];
    }
  } catch {
    // RPC may not exist — fall back to client-side filter
  }

  // Fallback if RPC missing: fetch recent and filter by content ILIKE
  if (highlights.length === 0) {
    const { data } = await supabaseAdmin
      .from('highlights')
      .select('id, content, source_type, source_id, source_title, tags')
      .eq('user_id', userId)
      .limit(200);
    const all = (data ?? []) as Omit<HighlightHit, 'rank'>[];
    const scored = all
      .map((h) => {
        const lower = `${h.content} ${h.source_title || ''}`.toLowerCase();
        let rank = 0;
        for (const kw of keywords) {
          if (kw && lower.includes(kw.toLowerCase())) rank += 1;
        }
        if (lower.includes(rawQuery.toLowerCase())) rank += 2;
        return { ...h, rank };
      })
      .filter((h) => h.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8);
    highlights = scored;
  }

  // 3. Search books via ILIKE on title/author/summary::text
  const { data: allBooks } = await supabaseAdmin
    .from('books')
    .select('id, title, author, summary')
    .eq('user_id', userId);

  const bookHits: BookHit[] = [];
  for (const b of (allBooks ?? []) as BookHit[]) {
    const haystack = `${b.title} ${b.author || ''} ${JSON.stringify(b.summary || {})}`.toLowerCase();
    let score = 0;
    if (haystack.includes(rawQuery.toLowerCase())) score += 3;
    for (const kw of keywords) {
      if (kw && haystack.includes(kw.toLowerCase())) score += 1;
    }
    if (score > 0) bookHits.push(b);
    if (bookHits.length >= 4) break;
  }

  const totalHits = highlights.length + bookHits.length;

  // 4. Build source list (numbered)
  const sources: Source[] = [];
  highlights.forEach((h, i) => {
    sources.push({
      n: i + 1,
      kind: 'highlight',
      id: h.id,
      title: h.source_title || 'Highlight',
      snippet: snippet(h.content, keywords),
    });
  });
  bookHits.forEach((b, i) => {
    const s = b.summary as { thesis?: string; ultra_short?: string } | null;
    const snip = s?.ultra_short || s?.thesis || '';
    sources.push({
      n: highlights.length + i + 1,
      kind: 'book',
      id: b.id,
      title: `${b.title}${b.author ? ` — ${b.author}` : ''}`,
      snippet: snippet(snip || `Book in library`, keywords),
    });
  });

  if (totalHits === 0) {
    const empty: AnswerResult = {
      answer: "Your library doesn't have strong coverage of this topic yet. Try adding a book about it, or capture a few quotes that touch on this theme.",
      sources: [],
      model_used: pickModel('search-expand'),
      cached: false,
      searched: { highlights: 0, books: 0 },
    };
    return Response.json(empty);
  }

  // 5. Synthesize with Sonnet
  const sourceList = sources
    .map((s) => `[${s.n}] (${s.kind === 'highlight' ? 'Quote' : 'Book'}) ${s.title}\n    "${s.snippet}"`)
    .join('\n\n');

  const systemPrompt = `You are a personal library assistant. Answer the user's question using ONLY the sources provided. Cite each specific claim with [^N] where N matches the source number. Be concise (3-6 sentences). Respect each thinker's actual view — don't manufacture a consensus that isn't there. If sources contradict each other, say so. If the sources don't directly address the question, say: "Your library only partially covers this. Here's what it does say:" and summarize what IS there. Never invent citations.`;

  const userPrompt = `Question: ${rawQuery}

Sources:
${sourceList}

Write the cited answer now.`;

  let answer = '';
  let modelUsed = pickModel('summary.long');
  try {
    const resp = await anthropic.messages.create({
      model: modelUsed,
      max_tokens: 800,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = resp.content[0];
    answer = block.type === 'text' ? block.text.trim() : '';
  } catch (err) {
    return Response.json({
      error: 'Synthesis failed',
      detail: err instanceof Error ? err.message : 'unknown',
    }, { status: 500 });
  }

  // 6. Validate citations
  answer = validateCitations(answer, sources.length);

  const result: AnswerResult = {
    answer,
    sources,
    model_used: modelUsed,
    cached: false,
    searched: { highlights: highlights.length, books: bookHits.length },
  };

  // 7. Cache for 24h
  await setCached('search.expand', answerKey, result, 86400);

  return Response.json(result);
}
