import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { extractArticle, isBookUrl, canonicalizeUrl } from '@/lib/extract';
import { generateBookSummary, lookupBookMetadata, generatePersonalReview } from '@/lib/books';
import { getCached, setCached, hashInput } from '@/lib/ai-cache';

const CLIP_CLASSIFY_TTL = 7 * 24 * 60 * 60; // 7 days — URL content is semi-stable

type Destination = 'kb' | 'book' | 'highlight' | 'task' | 'whiteboard' | 'note';

interface ClipRequest {
  url?: string;
  selection?: string;    // text the user highlighted before clipping
  title?: string;        // if provided, override the extracted title
  content?: string;      // raw text if no URL
  route?: 'auto' | Destination;
  mode?: 'preview' | 'save';  // preview = extract only, save = write to destination
  tags?: string[];
}

interface Classification {
  route: Destination;
  title: string;
  tags: string[];
  summary: string;
  reason: string;
}

// POST: the main clip endpoint
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json() as ClipRequest;
  const { url, selection, title: titleOverride, content: contentOverride, route, mode = 'save', tags = [] } = body;

  if (!url && !selection && !contentOverride) {
    return Response.json({ error: 'url, selection, or content required' }, { status: 400 });
  }

  // ── 1. Gather content ──
  let extracted: Awaited<ReturnType<typeof extractArticle>> | null = null;
  let title = titleOverride || '';
  let content = contentOverride || '';
  let siteName = '';
  let excerpt = '';
  let og_image: string | null = null;
  let clipUrl = '';

  if (url) {
    extracted = await extractArticle(url);
    clipUrl = extracted.canonical_url;
    if (!title) title = extracted.title || siteName || url;
    if (!content) content = extracted.content;
    siteName = extracted.site;
    excerpt = extracted.excerpt;
    og_image = extracted.og_image;
  }

  // Selection always wins for content if present — it's the user's explicit highlight
  if (selection && selection.trim()) {
    // Keep extracted as metadata, but the user selection becomes the primary content for classification
    content = selection.trim();
  }

  // ── 2. Preview mode: return without saving ──
  if (mode === 'preview') {
    let suggestion: Classification | null = null;
    try {
      suggestion = await classifyContent({ url: clipUrl, title, content, selection, site: siteName });
    } catch { /* non-fatal */ }

    return Response.json({
      extracted: extracted ? { ...extracted } : null,
      title,
      content,
      excerpt,
      og_image,
      site: siteName,
      url: clipUrl,
      suggestion,
    });
  }

  // ── 3. Determine destination ──
  let destination: Destination;
  let aiClassification: Classification | null = null;

  if (route && route !== 'auto') {
    destination = route;
  } else {
    // Special case: Amazon/Goodreads/OpenLibrary → book
    if (url && isBookUrl(url)) {
      destination = 'book';
    } else if (selection && selection.trim() && (selection.length < 500)) {
      // Short selection → highlight
      destination = 'highlight';
    } else {
      // AI classification
      try {
        aiClassification = await classifyContent({ url: clipUrl, title, content, selection, site: siteName });
        destination = aiClassification.route;
      } catch {
        // Fallback: KB entry
        destination = url ? 'kb' : 'note';
      }
    }
  }

  // ── 4. Route to destination ──
  try {
    const result = await routeToDestination({
      destination,
      userId,
      title: aiClassification?.title || title,
      content,
      excerpt,
      url: clipUrl,
      siteName,
      og_image,
      tags: [...tags, ...(aiClassification?.tags || [])].filter(Boolean),
      summary: aiClassification?.summary || excerpt,
    });

    return Response.json({
      ok: true,
      created: result,
      destination,
      classification: aiClassification,
    });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : 'Failed to save',
      destination,
    }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// Classification (Haiku)
// ─────────────────────────────────────────────
async function classifyContent(args: {
  url: string;
  title: string;
  content: string;
  selection?: string;
  site?: string;
}): Promise<Classification> {
  const contentSample = args.content.slice(0, 2500);
  const selectionNote = args.selection && args.selection.trim()
    ? `\n\nUser selection (prioritize this — it's what they highlighted):\n"${args.selection.slice(0, 1000)}"`
    : '';

  // Cache key: hash of URL + title + selection (content excluded — it shifts too much)
  // Same URL + same selection → same classification. If content has changed significantly,
  // the 7-day TTL + cache eviction catches it.
  const cacheKey = hashInput({
    url: args.url,
    title: args.title,
    selection: args.selection || '',
  });

  const cached = await getCached<Classification>('clip.classify', cacheKey);
  if (cached) return cached;

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Classify this web content for a personal knowledge system.

URL: ${args.url}
Site: ${args.site || 'unknown'}
Title: ${args.title}

Content:
${contentSample}${selectionNote}

Destinations:
- "kb" — long-form article, reference material, how-to, research (most articles go here)
- "book" — the URL is a book-seller page (Amazon/Goodreads). Skip this unless URL is clearly a book.
- "highlight" — a short, quotable selection or aphorism worth remembering (use when user has made a selection under 500 chars)
- "task" — contains an action item the user needs to do (e.g. "Pay X", "Review Y", "Call Z")
- "whiteboard" — a feature idea, bug, or product concept for the user's own app or business
- "note" — a quick thought or personal note (use sparingly; kb is usually better)

Return ONLY valid JSON:
{
  "route": "kb|book|highlight|task|whiteboard|note",
  "title": "concise title (max 80 chars)",
  "tags": ["array", "of", "3-5", "tags"],
  "summary": "one-sentence summary of what this content is about",
  "reason": "one-sentence why this destination was chosen"
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse classification');
  const classification = JSON.parse(match[0]) as Classification;

  // Store in cache
  await setCached('clip.classify', cacheKey, classification, CLIP_CLASSIFY_TTL);

  return classification;
}

// ─────────────────────────────────────────────
// Route to the right table
// ─────────────────────────────────────────────
async function routeToDestination(args: {
  destination: Destination;
  userId: string;
  title: string;
  content: string;
  excerpt: string;
  url: string;
  siteName: string;
  og_image: string | null;
  tags: string[];
  summary: string;
}) {
  const { destination, userId, title, content, url, siteName, tags, summary } = args;

  switch (destination) {
    case 'kb': {
      // Format content with source footer
      const body = [
        content,
        '',
        '---',
        `Source: ${url}`,
        siteName ? `Site: ${siteName}` : '',
      ].filter(Boolean).join('\n');

      const { data, error } = await supabaseAdmin.from('knowledge_base').insert({
        user_id: userId,
        title: title.slice(0, 200),
        content: body,
        category: 'Reference',
        tags: [...new Set([...(tags || []), 'clipped'])].slice(0, 10),
      }).select('id, title').single();

      if (error) throw new Error(`KB save failed: ${error.message}`);
      return { id: data.id, type: 'kb', title: data.title };
    }

    case 'book': {
      // For book-seller URLs: run the books summarize flow
      // Try to extract the book title + author from the extracted title (Amazon pattern: "Book Title: Author: 9781234567890: Amazon.com: Books")
      let bookTitle = title;
      let bookAuthor = '';
      const amazonMatch = title.match(/^(.+?)(?:\s*:\s*(.+?))?(?:\s*:\s*\d+.*)?$/);
      if (amazonMatch) {
        bookTitle = amazonMatch[1].trim();
        if (amazonMatch[2]) bookAuthor = amazonMatch[2].trim();
      }

      // Use lookupBookMetadata to enrich
      const md = await lookupBookMetadata(`${bookTitle} ${bookAuthor}`.trim());

      const resolvedTitle = md?.title || bookTitle;
      const resolvedAuthor = md?.author || bookAuthor || 'Unknown';
      const isbn = md?.isbn;
      const cover_url = md?.cover_url;

      // Gather user context
      let userContext = '';
      try {
        const [notesRes, goalsRes] = await Promise.all([
          supabaseAdmin.from('notes').select('content').eq('user_id', userId).limit(1).maybeSingle(),
          supabaseAdmin.from('goals').select('title').eq('user_id', userId).eq('status', 'active').limit(5),
        ]);
        const notepad = notesRes.data?.content?.slice(0, 400) || '';
        const goalList = (goalsRes.data ?? []).map(g => g.title).join(', ');
        userContext = [notepad, goalList ? `Active goals: ${goalList}` : ''].filter(Boolean).join('\n\n');
      } catch { /* skip */ }

      const bookSummary = await generateBookSummary(resolvedTitle, resolvedAuthor, userContext);
      const personal_review = userContext
        ? await generatePersonalReview({ title: resolvedTitle, author: resolvedAuthor, summary: bookSummary }, userContext)
        : '';

      const { data, error } = await supabaseAdmin.from('books').insert({
        user_id: userId,
        title: resolvedTitle,
        author: resolvedAuthor,
        isbn: isbn || null,
        cover_url: cover_url || null,
        status: 'want-to-read',
        summary: bookSummary,
        personal_review: personal_review || null,
      }).select('id, title').single();

      if (error) throw new Error(`Book save failed: ${error.message}`);
      return { id: data.id, type: 'book', title: data.title };
    }

    case 'highlight': {
      const { data, error } = await supabaseAdmin.from('highlights').insert({
        user_id: userId,
        content: content.slice(0, 5000),
        source_type: 'web',
        source_title: title.slice(0, 200),
        tags: [...new Set([...(tags || []), 'clipped'])].slice(0, 10),
      }).select('id, content').single();

      if (error) throw new Error(`Highlight save failed: ${error.message}`);
      return { id: data.id, type: 'highlight', title: data.content.slice(0, 80) };
    }

    case 'task': {
      const { data, error } = await supabaseAdmin.from('todos').insert({
        user_id: userId,
        title: title.slice(0, 200),
        description: summary || `Source: ${url}`,
        status: 'todo',
        priority: 'medium',
        bucket: 'Clipped',
        tags: [...new Set([...(tags || []), 'clipped'])].slice(0, 10),
      }).select('id, title').single();

      if (error) throw new Error(`Task save failed: ${error.message}`);
      return { id: data.id, type: 'task', title: data.title };
    }

    case 'whiteboard': {
      const { data, error } = await supabaseAdmin.from('whiteboard').insert({
        user_id: userId,
        title: title.slice(0, 200),
        description: `${summary}\n\nSource: ${url}`,
        status: 'idea',
        priority: 99,
        tags: [...new Set([...(tags || []), 'clipped'])].slice(0, 10),
      }).select('id, title').single();

      if (error) throw new Error(`Whiteboard save failed: ${error.message}`);
      return { id: data.id, type: 'whiteboard', title: data.title };
    }

    case 'note': {
      const { data, error } = await supabaseAdmin.from('notes_v2').insert({
        user_id: userId,
        title: title.slice(0, 200),
        content: `${content}\n\n---\nSource: ${url}`,
        images: [],
      }).select('id, title').single();

      if (error) throw new Error(`Note save failed: ${error.message}`);
      return { id: data.id, type: 'note', title: data.title };
    }
  }
}

// GET: fetch preview only (used by the capture page on mount)
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) return Response.json({ error: 'url required' }, { status: 400 });

  const canonical = canonicalizeUrl(url);
  const extracted = await extractArticle(canonical);

  let suggestion: Classification | null = null;
  if (extracted.content) {
    try {
      suggestion = await classifyContent({
        url: canonical,
        title: extracted.title,
        content: extracted.content,
        site: extracted.site,
      });
    } catch { /* non-fatal */ }
  }

  return Response.json({
    extracted,
    suggestion,
  });
}
