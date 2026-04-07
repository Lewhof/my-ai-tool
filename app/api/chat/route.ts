import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClaudeStream } from '@/lib/providers/claude';
import { createGroqStream } from '@/lib/providers/groq';
import { createPerplexityStream } from '@/lib/providers/perplexity';
import { createGeminiStream } from '@/lib/providers/gemini';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { threadId, message, model: requestModel } = body;
  if (!message?.trim()) return Response.json({ error: 'Message required' }, { status: 400 });

  // Create or get thread
  let currentThreadId = threadId;
  let threadModel = requestModel || 'claude-haiku';

  if (!currentThreadId) {
    const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    const { data, error } = await supabaseAdmin
      .from('chat_threads')
      .insert({ user_id: userId, title, model: threadModel })
      .select('id, model')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    currentThreadId = data.id;
    threadModel = data.model;
  } else {
    // Get existing thread's model
    const { data: thread } = await supabaseAdmin
      .from('chat_threads')
      .select('model')
      .eq('id', currentThreadId)
      .single();
    if (thread?.model) threadModel = thread.model;

    // Update model if changed
    if (requestModel && requestModel !== threadModel) {
      threadModel = requestModel;
      await supabaseAdmin
        .from('chat_threads')
        .update({ model: threadModel })
        .eq('id', currentThreadId);
    }
  }

  // Save user message
  const { error: msgError } = await supabaseAdmin.from('chat_messages').insert({
    thread_id: currentThreadId,
    role: 'user',
    content: message,
  });
  if (msgError) return Response.json({ error: msgError.message }, { status: 500 });

  // Load conversation history
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

  const systemPrompt = 'You are a helpful AI assistant. Be concise and clear. Use markdown formatting when appropriate.';

  // Route to provider
  let result: { stream: ReadableStream; getFullResponse: () => string; getUsage: () => { inputTokens: number; outputTokens: number } };

  try {
    switch (threadModel) {
      case 'claude-sonnet':
        result = createClaudeStream('smart', messages, systemPrompt);
        break;
      case 'groq-llama':
        result = createGroqStream(messages, systemPrompt);
        break;
      case 'perplexity':
        result = createPerplexityStream(messages, systemPrompt);
        break;
      case 'gemini':
        result = createGeminiStream(messages, systemPrompt);
        break;
      case 'claude-haiku':
      default:
        result = createClaudeStream('fast', messages, systemPrompt);
        break;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Provider error';
    return Response.json({ error: errMsg }, { status: 500 });
  }

  // Save assistant message after stream completes
  after(async () => {
    const fullResponse = result.getFullResponse();
    if (fullResponse) {
      const { inputTokens, outputTokens } = result.getUsage();
      await supabaseAdmin.from('chat_messages').insert({
        thread_id: currentThreadId,
        role: 'assistant',
        content: fullResponse,
        model: threadModel,
        tokens_used: inputTokens + outputTokens,
      });

      // Auto-name: if this is the first AI response, rename the thread
      // based on the response content (more descriptive than user's input)
      const { count } = await supabaseAdmin
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', currentThreadId)
        .eq('role', 'assistant');

      if (count === 1) {
        // First AI response — use first meaningful words as title
        const cleanText = fullResponse.replace(/[#*`\n]/g, ' ').trim();
        const words = cleanText.split(/\s+/).filter(Boolean).slice(0, 8);
        const autoTitle = words.join(' ').slice(0, 60) + (cleanText.length > 60 ? '...' : '');
        if (autoTitle.length > 5) {
          await supabaseAdmin
            .from('chat_threads')
            .update({ title: autoTitle, updated_at: new Date().toISOString() })
            .eq('id', currentThreadId);
          return;
        }
      }

      await supabaseAdmin
        .from('chat_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentThreadId);
    }
  });

  return new Response(result.stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-store',
      'X-Thread-Id': currentThreadId,
      'X-Model': threadModel,
    },
  });
}
