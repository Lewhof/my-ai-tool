import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET: List highlights with filters, or today's resurfacing feed (?mode=today)
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode');
  const source_type = searchParams.get('source_type');
  const tag = searchParams.get('tag');
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);

  if (mode === 'today') {
    // Spaced-repetition resurfacing: pick 5-7 highlights weighted by review_count
    // Simplified: least-recently-reviewed first, random jitter
    const { data } = await supabaseAdmin
      .from('highlights')
      .select('id, content, source_type, source_id, source_title, tags, last_reviewed_at, review_count, created_at')
      .eq('user_id', userId)
      .order('last_reviewed_at', { ascending: true, nullsFirst: true })
      .limit(20);

    const pool = data ?? [];
    // Shuffle + slice top 6
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 6);
    return Response.json({ highlights: shuffled });
  }

  let query = supabaseAdmin
    .from('highlights')
    .select('id, content, source_type, source_id, source_title, tags, last_reviewed_at, review_count, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (source_type) {
    query = query.eq('source_type', source_type);
  }
  if (tag) {
    query = query.contains('tags', [tag]);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ highlights: data ?? [] });
}

// POST: Save a new highlight, or bulk import from books (?mode=from-books)
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode');

  // Bulk import: mine every book.summary.key_ideas[*].quote into highlights,
  // deduped by (source_id, content).
  if (mode === 'from-books') {
    const { data: books } = await supabaseAdmin
      .from('books')
      .select('id, title, summary')
      .eq('user_id', userId);

    if (!books || books.length === 0) {
      return Response.json({ added: 0, skipped: 0, message: 'No books in library' });
    }

    // Load existing highlight content+source_id pairs to dedup
    const { data: existing } = await supabaseAdmin
      .from('highlights')
      .select('content, source_id')
      .eq('user_id', userId)
      .eq('source_type', 'book');

    const existingSet = new Set<string>(
      (existing ?? []).map((h) => `${h.source_id || ''}::${(h.content || '').trim().toLowerCase()}`)
    );

    const rows: Array<{
      user_id: string;
      content: string;
      source_type: string;
      source_id: string;
      source_title: string;
      tags: string[];
    }> = [];
    let skipped = 0;

    for (const book of books) {
      const summary = book.summary as {
        key_ideas?: Array<{ concept?: string; quote?: string; when_to_apply?: string }>;
      } | null;
      if (!summary?.key_ideas) continue;

      for (const idea of summary.key_ideas) {
        const quote = (idea.quote || '').trim();
        if (!quote || quote.length < 10) continue;
        const key = `${book.id}::${quote.toLowerCase()}`;
        if (existingSet.has(key)) { skipped++; continue; }
        existingSet.add(key);
        rows.push({
          user_id: userId,
          content: quote,
          source_type: 'book',
          source_id: book.id,
          source_title: book.title,
          tags: idea.concept ? [idea.concept.toLowerCase().replace(/\s+/g, '-').slice(0, 40)] : [],
        });
      }
    }

    if (rows.length === 0) {
      return Response.json({ added: 0, skipped, message: 'No new quotes to import' });
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('highlights')
      .insert(rows)
      .select('id');

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ added: inserted?.length ?? 0, skipped });
  }

  // Single insert
  const { content, source_type, source_id, source_title, tags } = await req.json();
  if (!content?.trim()) return Response.json({ error: 'Content required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('highlights')
    .insert({
      user_id: userId,
      content: content.trim(),
      source_type: source_type || 'manual',
      source_id: source_id || null,
      source_title: source_title || null,
      tags: Array.isArray(tags) ? tags : [],
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ highlight: data });
}

// PATCH: review-count bump OR content/tag edit
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { id, action, content, tags, source_title } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  if (action === 'review') {
    const { data: current } = await supabaseAdmin
      .from('highlights')
      .select('review_count')
      .eq('id', id)
      .single();

    await supabaseAdmin
      .from('highlights')
      .update({
        last_reviewed_at: new Date().toISOString(),
        review_count: (current?.review_count || 0) + 1,
      })
      .eq('id', id)
      .eq('user_id', userId);

    return Response.json({ ok: true });
  }

  // Content/tag edit
  const updates: Record<string, unknown> = {};
  if (typeof content === 'string') updates.content = content.trim();
  if (Array.isArray(tags)) updates.tags = tags;
  if (typeof source_title === 'string') updates.source_title = source_title.trim() || null;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('highlights')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ highlight: data });
}

// DELETE: Remove a highlight
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await supabaseAdmin.from('highlights').delete().eq('id', id).eq('user_id', userId);
  return Response.json({ ok: true });
}
