import { auth } from '@clerk/nextjs/server';
import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';
import { AGENT_TOOLS } from '@/lib/agent/tools';
import { executeTool } from '@/lib/agent/executor';

const SYSTEM_PROMPT = `You are the Lewhof AI Master Agent — a personal AI assistant with access to the user's full productivity stack.

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

  return Response.json({
    response: finalResponse,
    iterations,
  });
}
