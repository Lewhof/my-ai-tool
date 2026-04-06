import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODELS } from '@/lib/anthropic';
import pdfParse from 'pdf-parse';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { message, threadId } = await req.json();
  if (!message?.trim()) return new Response('Message required', { status: 400 });

  // Get document
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!doc) return new Response('Document not found', { status: 404 });

  // Create or get thread
  let currentThreadId = threadId;
  if (!currentThreadId) {
    const title = `Chat about ${doc.name}`;
    const { data } = await supabaseAdmin
      .from('chat_threads')
      .insert({ user_id: userId, title })
      .select('id')
      .single();
    currentThreadId = data?.id;
  }

  // Save user message
  if (currentThreadId) {
    await supabaseAdmin.from('chat_messages').insert({
      thread_id: currentThreadId,
      role: 'user',
      content: message,
    });
  }

  // Build content based on file type
  const systemContent: string[] = ['You are a helpful assistant analyzing a document the user uploaded.'];

  if (doc.file_type === 'application/pdf') {
    // Download and extract PDF text
    const { data: fileData } = await supabaseAdmin.storage
      .from('documents')
      .download(doc.file_path);

    if (fileData) {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      try {
        const pdf = await pdfParse(buffer);
        const text = pdf.text.slice(0, 50000);
        systemContent.push(`Document "${doc.name}" content:\n${text}`);
      } catch {
        systemContent.push(`Could not extract text from "${doc.name}".`);
      }
    }
  }

  // Load history
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (currentThreadId) {
    const { data: msgs } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('thread_id', currentThreadId)
      .order('created_at', { ascending: true })
      .limit(20);
    if (msgs) {
      for (const m of msgs) {
        history.push({ role: m.role as 'user' | 'assistant', content: m.content });
      }
    }
  }

  // For images, use vision
  type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  const userContent: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

  if (doc.file_type.startsWith('image/')) {
    const { data: fileData } = await supabaseAdmin.storage
      .from('documents')
      .download(doc.file_path);
    if (fileData) {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      (userContent as Array<unknown>).push({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: doc.file_type as ImageMediaType,
          data: buffer.toString('base64'),
        },
      });
    }
  }
  (userContent as Array<unknown>).push({ type: 'text' as const, text: message });

  // Only use text messages for history (not image blocks)
  const apiMessages: Anthropic.MessageCreateParams['messages'] = [
    ...history.slice(0, -1).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userContent },
  ];

  const stream = anthropic.messages.stream({
    model: MODELS.fast,
    max_tokens: 2048,
    system: systemContent.join('\n\n'),
    messages: apiMessages,
  });

  let fullResponse = '';

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullResponse += event.delta.text;
            controller.enqueue(new TextEncoder().encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  after(async () => {
    if (fullResponse && currentThreadId) {
      await supabaseAdmin.from('chat_messages').insert({
        thread_id: currentThreadId,
        role: 'assistant',
        content: fullResponse,
        model: MODELS.fast,
      });
    }
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Thread-Id': currentThreadId ?? '',
    },
  });
}
