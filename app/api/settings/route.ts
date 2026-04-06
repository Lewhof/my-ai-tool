import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Upsert: get or create default settings
  let { data } = await supabaseAdmin
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) {
    const { data: created } = await supabaseAdmin
      .from('user_settings')
      .insert({ user_id: userId })
      .select('*')
      .single();
    data = created;
  }

  return Response.json(data);
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const updates = await req.json();
  const allowed = ['default_model', 'dashboard_layout', 'theme'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  const { error } = await supabaseAdmin
    .from('user_settings')
    .update(filtered)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
