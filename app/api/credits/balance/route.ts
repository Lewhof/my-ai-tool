import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// Upsert the user's Anthropic balance state. `balance` is the current
// remaining credit on the Anthropic account, read manually from
// console.anthropic.com after a top-up.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { balance, threshold } = await req.json() as {
    balance?: number;
    threshold?: number;
  };

  if (typeof balance !== 'number' || balance < 0 || !Number.isFinite(balance)) {
    return Response.json({ error: 'balance must be a non-negative number' }, { status: 400 });
  }

  const threshVal = typeof threshold === 'number' && threshold >= 0 && Number.isFinite(threshold)
    ? threshold
    : 5;

  // Upsert by (user_id, provider)
  const { data: existing } = await supabaseAdmin
    .from('billing_state')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'anthropic')
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const { error } = await supabaseAdmin
      .from('billing_state')
      .update({
        starting_balance_usd: balance,
        alert_threshold_usd: threshVal,
        set_at: now,
        updated_at: now,
      })
      .eq('id', existing.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabaseAdmin.from('billing_state').insert({
      user_id: userId,
      provider: 'anthropic',
      starting_balance_usd: balance,
      alert_threshold_usd: threshVal,
      set_at: now,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

// Clear the user's balance state (they no longer want to track it).
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { error } = await supabaseAdmin
    .from('billing_state')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'anthropic');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
