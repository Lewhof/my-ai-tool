import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET: List highlights, or today's resurfacing feed (?mode=today)
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode');
  const source_type = searchParams.get('source_type');

  if (mode === 'today') {
    // Spaced-repetition resurfacing: pick 5-7 highlights weighted by review_count
    // Simplified: least-recently-reviewed first, random jitter
    const { data } = await supabaseAdmin
      .from('highlights')
      .select('*')
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
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (source_type) {
    query = query.eq('source_type', source_type);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ highlights: data ?? [] });
}

// POST: Save a new highlight
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

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
      tags: tags || [],
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ highlight: data });
}

// PATCH: Mark highlight as reviewed
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id, action } = await req.json();
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
  }

  return Response.json({ ok: true });
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
