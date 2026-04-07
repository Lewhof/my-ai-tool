import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// Dashboard notepad — uses the most recently updated note from notes_v2
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Get the most recent note
  const { data } = await supabaseAdmin
    .from('notes_v2')
    .select('id, title, content')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    // Create a default note
    const { data: created } = await supabaseAdmin
      .from('notes_v2')
      .insert({ user_id: userId, title: 'Quick Notes', content: '' })
      .select('id, title, content')
      .single();
    return Response.json(created);
  }

  return Response.json(data);
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id, content } = await req.json();

  if (id) {
    // Update specific note
    const { error } = await supabaseAdmin
      .from('notes_v2')
      .update({ content })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    // Fallback: update most recent note
    const { data: latest } = await supabaseAdmin
      .from('notes_v2')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (latest) {
      await supabaseAdmin
        .from('notes_v2')
        .update({ content })
        .eq('id', latest.id);
    }
  }

  return Response.json({ ok: true });
}
