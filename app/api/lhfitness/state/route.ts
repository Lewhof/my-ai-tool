import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// Cross-device sync mirror for LH Fitness state. localStorage stays the
// primary store on each client; this endpoint lets a freshly-opened
// browser/PWA pull the user's existing profile + history instead of
// being sent back through onboarding.

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('lhfitness_state')
    .select('state, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ state: null, updated_at: null });

  return Response.json({ state: data.state, updated_at: data.updated_at });
}

export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('state' in body)) {
    return Response.json({ error: 'state required' }, { status: 400 });
  }

  // Bound the payload — JSONB column accepts anything but we shouldn't.
  const serialized = JSON.stringify(body.state);
  if (serialized.length > 5_000_000) {
    return Response.json({ error: 'state too large (5MB cap)' }, { status: 413 });
  }

  const { error } = await supabaseAdmin
    .from('lhfitness_state')
    .upsert({
      user_id: userId,
      state: body.state,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, updated_at: new Date().toISOString() });
}
