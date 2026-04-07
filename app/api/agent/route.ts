import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';
import { supabaseAdmin } from '@/lib/supabase-server';
import { AGENT_TOOLS } from '@/lib/agent/tools';
import { executeTool } from '@/lib/agent/executor';

const SYSTEM_PROMPT = `You are Cerebro — the Lewhof AI Master Agent. A personal AI assistant with access to the user's full productivity stack.

You have tools to:
- Check and create calendar events
- Create and view tasks (todos)
- Manage whiteboard backlog items
- Search and analyze documents
- Save notes
- Check weather
- Check AI usage/credits
- Search the knowledge base
- Search the web for current information

Guidelines:
- Use tools proactively when the user's request requires data or actions
- Chain multiple tools when needed (e.g., check calendar then create a task)
- Be concise and actionable in responses
- Use markdown formatting
- When you create something (task, note, etc.), confirm what was created
- If a tool fails, explain what happened and suggest alternatives
- You are the user's CTO and personal assistant — think strategically`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { message, history } = await req.json();
  if (!message?.trim()) return Response.json({ error: 'Message required' }, { status: 400 });

  // Build messages array
  const messages: Anthropic.Messages.MessageParam[] = [
    ...(history ?? []).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ];

  // Agentic loop — keep calling tools until the model stops
  let finalResponse = '';
  let iterations = 0;
  const maxIterations = 10;
  let currentMessages = [...messages];

  while (iterations < maxIterations) {
    iterations++;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      messages: currentMessages,
    });

    // Check if the model wants to use tools
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    );
    const textBlocks = response.content.filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
    );

    if (toolUseBlocks.length === 0) {
      // No tool calls — we're done
      finalResponse = textBlocks.map((b) => b.text).join('\n');
      break;
    }

    // Execute all tool calls
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        userId
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add assistant response and tool results to messages
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];

    // If stop_reason is 'end_turn', grab text and finish
    if (response.stop_reason === 'end_turn') {
      finalResponse = textBlocks.map((b) => b.text).join('\n');
      break;
    }
  }

  // Save conversation to persistent history
  after(async () => {
    try {
      // Get or create the agent thread
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

      if (thread) {
        // Save user message
        await supabaseAdmin.from('chat_messages').insert({
          thread_id: thread.id,
          role: 'user',
          content: message,
        });

        // Save agent response
        if (finalResponse) {
          await supabaseAdmin.from('chat_messages').insert({
            thread_id: thread.id,
            role: 'assistant',
            content: finalResponse,
            model: 'claude-sonnet',
          });
        }

        // Update thread timestamp
        await supabaseAdmin
          .from('chat_threads')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', thread.id);
      }
    } catch { /* silent — don't break the response if history save fails */ }
  });

  return Response.json({
    response: finalResponse,
    iterations,
  });
}
