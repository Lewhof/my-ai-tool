import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { generateBookSummary, lookupBookMetadata, generatePersonalReview } from '@/lib/books';

// POST: Add a book by title/author, lookup metadata, generate AI summary
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { query, title: titleIn, author: authorIn } = await req.json() as {
    query?: string;
    title?: string;
    author?: string;
  };

  // 1. Determine book metadata
  let title = titleIn?.trim() || '';
  let author = authorIn?.trim() || '';
  let cover_url: string | undefined;
  let isbn: string | undefined;

  if (query && query.trim() && (!title || !author)) {
    const metadata = await lookupBookMetadata(query);
    if (metadata) {
      title = title || metadata.title;
      author = author || metadata.author;
      cover_url = metadata.cover_url;
      isbn = metadata.isbn;
    } else {
      title = title || query;
      author = author || 'Unknown';
    }
  }

  if (!title) {
    return Response.json({ error: 'Title or query required' }, { status: 400 });
  }

  // 2. Pull user context for personalized review
  let userContext = '';
  try {
    const [notesRes, goalsRes] = await Promise.all([
      supabaseAdmin.from('notes').select('content').eq('user_id', userId).limit(1).maybeSingle(),
      supabaseAdmin.from('goals').select('title, description').eq('user_id', userId).eq('status', 'active').limit(5),
    ]);
    const notepad = notesRes.data?.content?.slice(0, 400) || '';
    const goals = (goalsRes.data ?? []).map(g => `${g.title}${g.description ? ': ' + g.description : ''}`).join('\n');
    userContext = [notepad, goals].filter(Boolean).join('\n\n');
  } catch { /* skip */ }

  // 3. Generate AI summary (Sonnet — the quality pass) with retry on 529/overloaded
  let summary;
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      summary = await generateBookSummary(title, author, userContext);
      break;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isOverloaded = errMsg.includes('overloaded') || errMsg.includes('529') || errMsg.includes('Overloaded');
      if (isOverloaded && attempt < MAX_RETRIES) {
        // Exponential backoff: 3s, 6s
        await new Promise(r => setTimeout(r, attempt * 3000));
        continue;
      }
      const status = isOverloaded ? 503 : 500;
      const message = isOverloaded
        ? 'AI is temporarily overloaded. Please try again in a minute.'
        : errMsg;
      return Response.json({ error: message }, { status });
    }
  }

  // 4. Generate personal review layer
  const personal_review = userContext
    ? await generatePersonalReview({ title, author, summary }, userContext)
    : '';

  // 5. Save to database
  const { data, error } = await supabaseAdmin
    .from('books')
    .insert({
      user_id: userId,
      title,
      author,
      isbn: isbn || null,
      cover_url: cover_url || null,
      status: 'want-to-read',
      summary,
      personal_review: personal_review || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ book: data });
}
