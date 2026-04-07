import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data } = await supabaseAdmin
    .from('calendar_accounts')
    .select('id, label, email, provider, color, is_default, created_at')
    .eq('user_id', userId)
    .order('is_default', { ascending: false });

  return Response.json({ accounts: data ?? [] });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: 'Account ID required' }, { status: 400 });

  await supabaseAdmin
    .from('calendar_accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id, label, color, is_default } = await req.json();
  if (!id) return Response.json({ error: 'Account ID required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (label) updates.label = label;
  if (color) updates.color = color;
  if (is_default !== undefined) {
    updates.is_default = is_default;
    // Unset all others as default
    if (is_default) {
      await supabaseAdmin
        .from('calendar_accounts')
        .update({ is_default: false })
        .eq('user_id', userId);
    }
  }

  await supabaseAdmin
    .from('calendar_accounts')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId);

  return Response.json({ ok: true });
}
