import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const VALID_STATUS = ['want-to-read', 'reading', 'finished'];

// GET: List books (optional status filter)
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  let query = supabaseAdmin
    .from('books')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (status && VALID_STATUS.includes(status)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ books: data ?? [] });
}

// POST: Add a book (manual, without summary)
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { title, author, isbn, cover_url, status, rating, tags } = await req.json();
  if (!title?.trim()) return Response.json({ error: 'Title required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('books')
    .insert({
      user_id: userId,
      title: title.trim(),
      author: author?.trim() || null,
      isbn: isbn || null,
      cover_url: cover_url || null,
      status: VALID_STATUS.includes(status) ? status : 'want-to-read',
      rating: rating || null,
      tags: tags || [],
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ book: data });
}

// PATCH: Update a book
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id, title, author, status, rating, personal_review, tags } = await req.json();
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (author !== undefined) updates.author = author;
  if (status !== undefined) {
    if (!VALID_STATUS.includes(status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = status;
    if (status === 'finished') {
      updates.finished_at = new Date().toISOString();
    }
  }
  if (rating !== undefined) updates.rating = rating;
  if (personal_review !== undefined) updates.personal_review = personal_review;
  if (tags !== undefined) updates.tags = tags;

  const { data, error } = await supabaseAdmin
    .from('books')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ book: data });
}

// DELETE: Remove a book
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await supabaseAdmin.from('books').delete().eq('id', id).eq('user_id', userId);
  return Response.json({ ok: true });
}
