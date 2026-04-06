import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { v4 as uuidv4 } from 'crypto';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { threadId, message } = await req.json();
  if (!message?.trim()) return new Response('Message required', { status: 400 });

  // Create or get thread
  let currentThreadId = threadId;
  if (!currentThreadId) {
    const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    const { data, error } = await supabaseAdmin
      .from('chat_threads')
      .insert({ user_id: userId, title })
      .select('id')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    currentThreadId = data.id;
  }

  // Save user message
  await supabaseAdmin.from('chat_messages').insert({
    thread_id: currentThreadId,
    role: 'user',
    content: message,
  });

  // Load conversation history (last 20 messages)
  const { data: history } = await supabaseAdmin
    .from('chat_messages')
    .select('role, content')
    .eq('thread_id', currentThreadId)
    .order('created_at', { ascending: true })
    .limit(20);

  const messages = (history ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Stream response
  const stream = anthropic.messages.stream({
    model: MODELS.fast,
    max_tokens: 2048,
    messages,
  });

  let fullResponse = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullResponse += event.delta.text;
            controller.enqueue(new TextEncoder().encode(event.delta.text));
          }
          if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens;
          }
          if (event.type === 'message_start' && event.message.usage) {
            inputTokens = event.message.usage.input_tokens;
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  // Save assistant message after stream completes
  after(async () => {
    if (fullResponse) {
      await supabaseAdmin.from('chat_messages').insert({
        thread_id: currentThreadId,
        role: 'assistant',
        content: fullResponse,
        model: MODELS.fast,
        tokens_used: inputTokens + outputTokens,
      });
      // Update thread timestamp
      await supabaseAdmin
        .from('chat_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentThreadId);
    }
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Thread-Id': currentThreadId,
    },
  });
}
