import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET /api/agent/feedback?resolved=false — list feedback for user
// POST /api/agent/feedback                — { message_id, rating, correction_text? }
//                                           upserts on message_id (one feedback per message)
// PATCH /api/agent/feedback               — { id, resolved }
// DELETE /api/agent/feedback?id=...       — hard delete

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const resolvedParam = searchParams.get('resolved');

  let query = supabaseAdmin
    .from('cerebro_message_feedback')
    .select('id, message_id, rating, correction_text, resolved, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (resolvedParam === 'false') query = query.eq('resolved', false);
  if (resolvedParam === 'true') query = query.eq('resolved', true);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Enrich with the referenced assistant message content
  const ids = (data ?? []).map((f) => f.message_id);
  const messageMap: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: msgs } = await supabaseAdmin
      .from('chat_messages')
      .select('id, content')
      .in('id', ids);
    for (const m of msgs ?? []) messageMap[m.id] = m.content;
  }

  const enriched = (data ?? []).map((f) => ({
    ...f,
    message_content: messageMap[f.message_id]?.slice(0, 500) || '(message not found)',
  }));

  return Response.json({ feedback: enriched });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { message_id, rating, correction_text } = body;

  if (!message_id) return Response.json({ error: 'message_id required' }, { status: 400 });
  if (!['up', 'down'].includes(rating)) return Response.json({ error: 'rating must be up or down' }, { status: 400 });

  // Upsert: one feedback row per message. If it already exists, update it.
  const { data: existing } = await supabaseAdmin
    .from('cerebro_message_feedback')
    .select('id')
    .eq('message_id', message_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('cerebro_message_feedback')
      .update({
        rating,
        correction_text: correction_text || null,
        resolved: false,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ feedback: data });
  }

  const { data, error } = await supabaseAdmin
    .from('cerebro_message_feedback')
    .insert({
      message_id,
      user_id: userId,
      rating,
      correction_text: correction_text || null,
      resolved: false,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ feedback: data });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { id, resolved } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('cerebro_message_feedback')
    .update({ resolved: !!resolved })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ feedback: data });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('cerebro_message_feedback')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
