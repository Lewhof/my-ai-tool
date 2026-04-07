import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { threadId, message } = body;
  if (!message?.trim()) return Response.json({ error: 'Message required' }, { status: 400 });

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
  const { error: msgError } = await supabaseAdmin.from('chat_messages').insert({
    thread_id: currentThreadId,
    role: 'user',
    content: message,
  });
  if (msgError) return Response.json({ error: msgError.message }, { status: 500 });

  // Load conversation history (last 30 messages for better context)
  const { data: history } = await supabaseAdmin
    .from('chat_messages')
    .select('role, content')
    .eq('thread_id', currentThreadId)
    .order('created_at', { ascending: true })
    .limit(30);

  const messages = (history ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Stream response
  let fullResponse = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let streamError = false;

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = anthropic.messages.stream({
          model: MODELS.fast,
          max_tokens: 4096,
          system: 'You are a helpful AI assistant. Be concise and clear. Use markdown formatting when appropriate.',
          messages,
        });

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
        streamError = true;
        const errMsg = err instanceof Error ? err.message : 'Stream failed';
        controller.enqueue(new TextEncoder().encode(`\n\n[Error: ${errMsg}]`));
        controller.close();
      }
    },
  });

  // Save assistant message after stream completes
  after(async () => {
    if (fullResponse && !streamError) {
      await supabaseAdmin.from('chat_messages').insert({
        thread_id: currentThreadId,
        role: 'assistant',
        content: fullResponse,
        model: MODELS.fast,
        tokens_used: inputTokens + outputTokens,
      });
      await supabaseAdmin
        .from('chat_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentThreadId);
    }
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-store',
      'X-Thread-Id': currentThreadId,
    },
  });
}
