import { auth } from '@clerk/nextjs/server';
import { after } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';
import { supabaseAdmin } from '@/lib/supabase-server';
import { AGENT_TOOLS } from '@/lib/agent/tools';
import { executeTool } from '@/lib/agent/executor';

const SYSTEM_PROMPT = `You are Cerebro — the Lewhof AI Master Agent. A personal AI assistant with access to the user's full productivity stack.

IMPORTANT — MEMORY & PERSISTENCE:
- You HAVE persistent conversation history. Your past conversations are saved and loaded each session.
- You can see your previous messages in this conversation — they are real, not simulated.
- When the user asks "do you remember" or references past discussions, check your conversation history above.
- You can also search the Knowledge Base for archived conversations and reference material using the search_kb tool.
- When discussing something important, proactively use save_note or search_kb to store/retrieve knowledge.
- You evolve and learn through accumulated KB entries and conversation context.

You have tools to:
- Check and create calendar events
- Create and view tasks (todos)
- Manage whiteboard backlog items
- Search and analyze documents
- Save notes (use this to remember important things)
- Search the knowledge base (use this to recall past discussions and decisions)
- Check weather
- Check AI usage/credits
- Search the web for current information
- Generate images
- Push tasks to Claude Code for development
- Get and triage emails

Guidelines:
- Use tools proactively when the user's request requires data or actions
- Chain multiple tools when needed (e.g., check calendar then create a task)
- Be concise and actionable in responses
- Use markdown formatting
- When you create something (task, note, etc.), confirm what was created
- If a tool fails, explain what happened and suggest alternatives
- You are the user's CTO and personal assistant — think strategically
- When the user discusses something worth remembering, proactively save it to notes or KB
- Reference past conversations naturally — you have memory, use it`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { message, history } = await req.json();
  if (!message?.trim()) return Response.json({ error: 'Message required' }, { status: 400 });

  // Search KB for relevant context to inject
  let kbContext = '';
  try {
    const keywords = message.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 3).join(' ');
    if (keywords) {
      const { data: kbResults } = await supabaseAdmin
        .from('knowledge_base')
        .select('title, content')
        .eq('user_id', userId)
        .or(`title.ilike.%${keywords}%,content.ilike.%${keywords}%`)
        .limit(2);

      if (kbResults?.length) {
        kbContext = `\n\nRelevant Knowledge Base context:\n${kbResults.map((k) => `--- ${k.title} ---\n${k.content.slice(0, 500)}`).join('\n\n')}`;
      }
    }
  } catch { /* skip KB search if it fails */ }

  // Build messages array
  const messages: Anthropic.Messages.MessageParam[] = [
    ...(history ?? []).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message + kbContext },
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
