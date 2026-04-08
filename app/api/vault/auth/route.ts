import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET — check if vault lock is set up and get status
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('vault_pin')
    .eq('user_id', userId)
    .single();

  return Response.json({
    hasPin: !!data?.vault_pin,
  });
}

// POST — set or verify vault PIN
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { action, pin } = await req.json();

  if (action === 'setup') {
    if (!pin || pin.length < 4) {
      return Response.json({ error: 'PIN must be at least 4 digits' }, { status: 400 });
    }
    // Store PIN hash (simple for now — in production use bcrypt)
    const pinHash = btoa(pin + userId);
    await supabaseAdmin
      .from('user_settings')
      .upsert({ user_id: userId, vault_pin: pinHash }, { onConflict: 'user_id' });
    return Response.json({ ok: true });
  }

  if (action === 'verify') {
    const { data } = await supabaseAdmin
      .from('user_settings')
      .select('vault_pin')
      .eq('user_id', userId)
      .single();

    if (!data?.vault_pin) {
      return Response.json({ error: 'No PIN set' }, { status: 400 });
    }

    const pinHash = btoa(pin + userId);
    if (pinHash === data.vault_pin) {
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Incorrect PIN' }, { status: 401 });
  }

  if (action === 'remove') {
    await supabaseAdmin
      .from('user_settings')
      .update({ vault_pin: null })
      .eq('user_id', userId);
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
