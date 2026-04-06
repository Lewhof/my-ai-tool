import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Get or create the user's notepad
  let { data } = await supabaseAdmin
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) {
    const { data: created } = await supabaseAdmin
      .from('notes')
      .insert({ user_id: userId, content: '' })
      .select()
      .single();
    data = created;
  }

  return Response.json(data);
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { content } = await req.json();

  const { error } = await supabaseAdmin
    .from('notes')
    .update({ content })
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
