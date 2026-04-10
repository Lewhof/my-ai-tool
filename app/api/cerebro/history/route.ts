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
    .select('id, role, content, created_at')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true })
    .limit(50);

  return Response.json({ messages: messages ?? [] });
}

// Save direct command messages to history
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { userMessage, assistantMessage } = await req.json();

  // Find or create agent thread
  let { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('agent_thread', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (!thread) {
    const { data: created } = await supabaseAdmin
      .from('chat_threads')
      .insert({ user_id: userId, title: 'Cerebro History', model: 'claude-sonnet', agent_thread: true })
      .select('id')
      .single();
    thread = created;
  }

  if (!thread) return Response.json({ error: 'Could not create thread' }, { status: 500 });

  // Save both messages
  if (userMessage) {
    await supabaseAdmin.from('chat_messages').insert({
      thread_id: thread.id,
      role: 'user',
      content: userMessage,
    });
  }
  if (assistantMessage) {
    await supabaseAdmin.from('chat_messages').insert({
      thread_id: thread.id,
      role: 'assistant',
      content: assistantMessage,
      model: 'system',
    });
  }

  await supabaseAdmin.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', thread.id);

  return Response.json({ ok: true });
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
