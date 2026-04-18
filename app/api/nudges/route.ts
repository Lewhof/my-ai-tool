import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET: List active nudges
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const now = new Date().toISOString();

  const { data } = await supabaseAdmin
    .from('nudges')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
    .order('created_at', { ascending: false })
    .limit(10);

  return Response.json(
    { nudges: data ?? [] },
    { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } }
  );
}

// PATCH: Dismiss or snooze a nudge
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id, action } = await req.json();
  if (!id || !action) return Response.json({ error: 'id and action required' }, { status: 400 });

  if (action === 'dismiss') {
    await supabaseAdmin
      .from('nudges')
      .update({ status: 'dismissed' })
      .eq('id', id)
      .eq('user_id', userId);
  } else if (action === 'snooze') {
    // Snooze for 24 hours
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from('nudges')
      .update({ snoozed_until: snoozedUntil })
      .eq('id', id)
      .eq('user_id', userId);
  }

  return Response.json({ ok: true });
}
