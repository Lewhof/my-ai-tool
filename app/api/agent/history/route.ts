import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Find the agent thread
  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('agent_thread', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (!thread) return Response.json({ messages: [] });

  // Get last 50 messages
  const { data: messages } = await supabaseAdmin
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true })
    .limit(50);

  return Response.json({ messages: messages ?? [] });
}

// Clear history
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('agent_thread', true)
    .single();

  if (thread) {
    await supabaseAdmin.from('chat_messages').delete().eq('thread_id', thread.id);
  }

  return Response.json({ ok: true });
}
