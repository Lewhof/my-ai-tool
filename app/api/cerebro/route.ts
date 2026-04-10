import { auth } from '@clerk/nextjs/server';
import Anthropic from '@anthropic-ai/sdk';
import { anthropic, cachedSystem, pickModel } from '@/lib/anthropic';
import { supabaseAdmin } from '@/lib/supabase-server';
import { CEREBRO_TOOLS } from '@/lib/cerebro/tools';
import { executeTool } from '@/lib/cerebro/executor';
import { getLearnedRules, bumpRuleHits } from '@/lib/cerebro/evolution';

// ── STATIC portion of the Cerebro system prompt ──
// This is cached via prompt caching (5-min TTL). Never reference
// current time / date / user state here — only static rules & tool descriptions.
// Break-even on cache: 1 hit. Cerebro is called dozens of times per day.
const CEREBRO_STATIC_PROMPT = `You are Cerebro — the Lewhof AI Master Agent. A personal AI assistant with access to the user's full productivity stack.

IMPORTANT — MEMORY & PERSISTENCE:
- You HAVE persistent conversation history. Your past conversations are saved and loaded each session.
- You can see your previous messages in this conversation — they are real, not simulated.
- When the user asks "do you remember" or references past discussions, check your conversation history above.
- You can also search the Knowledge Base for archived conversations and reference material using the search_kb tool.
- When discussing something important, proactively use save_note or search_kb to store/retrieve knowledge.
- You evolve and learn through accumulated KB entries and conversation context.

You have tools to:
- Check and create calendar events
- Create, view, update, complete, and delete tasks (todos)
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
- Reference past conversations naturally — you have memory, use it

CRITICAL — TASK COMPLETION (READ THIS CAREFULLY):
- When the user says "mark X done", "X is complete", "I finished X", "close X", "complete X", etc. — you MUST call the complete_todos tool.
- NEVER say you've marked something complete unless you actually called complete_todos and it returned success.
- The complete_todos tool accepts an array of fuzzy title matches — pass the user's exact phrasing, e.g. if they say "MArk SARS done, Golfday done, Talisman done" call complete_todos with titles: ["SARS", "Golfday", "Talisman"].
- Only report as complete the tasks the tool actually matched. If the tool returns "Could not find matches for: X", tell the user that X was not found — do NOT claim you completed it.
- If the user says "update task X to Y" or "change the priority of X" — use update_todo.
- If the user says "delete X" or "remove X" — use delete_todo.
- NEVER hallucinate task state changes. The source of truth is what the tool returns.

CRITICAL — TASK DEDUPLICATION:
- NEVER call push_to_claude_code if a task with the same or similar title already exists
- When the user says "approve", "cancel", "go", "yes" — these are task approval commands, NOT requests to create new tasks
- Do NOT interpret approval/status words as new task requests
- If unsure whether a task already exists, check the whiteboard or task queue first`;

/**
 * Build the Cerebro system prompt as a cached+dynamic block array.
 * The static portion is cached (90% discount on reads).
 * The dynamic portion (current time + learned rules) is added fresh each request.
 */
async function getSystemPrompt(userId: string, learnedRules: string): Promise<Anthropic.Messages.TextBlockParam[]> {
  const now = new Date();
  const sast = new Date(now.getTime() + 2 * 60 * 60 * 1000); // UTC+2
  const dateStr = sast.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = sast.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });

  const timeBlock = `CURRENT DATE & TIME:
- Today is ${dateStr}
- Current time is ${timeStr} SAST (South Africa Standard Time, UTC+2)
- ALWAYS use this date/time when referring to "today", "now", "this week", etc.
- When creating calendar events or tasks with dates, use this as reference`;

  // State snapshot — lightweight counts so Cerebro knows what the user has
  let snapshot = '';
  try {
    const [todosRes, whiteboardRes] = await Promise.all([
      supabaseAdmin.from('todos').select('status', { count: 'exact', head: false }).eq('user_id', userId),
      supabaseAdmin.from('whiteboard').select('title, status').eq('user_id', userId).order('priority', { ascending: true }).limit(5),
    ]);

    const todos = todosRes.data ?? [];
    const pending = todos.filter(t => t.status !== 'done').length;
    const done = todos.filter(t => t.status === 'done').length;
    const wb = (whiteboardRes.data ?? []).filter(w => w.status !== 'done').slice(0, 3);

    snapshot = `\n\nSTATE SNAPSHOT (auto-injected):
- Tasks: ${pending} pending, ${done} done (${todos.length} total)` +
      (wb.length ? `\n- Top whiteboard items: ${wb.map(w => `${w.title} [${w.status}]`).join(', ')}` : '');
  } catch { /* snapshot is optional — never block the prompt */ }

  const dynamic = [timeBlock, snapshot, learnedRules].filter(Boolean).join('\n\n');
  return cachedSystem(CEREBRO_STATIC_PROMPT, dynamic);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { message, history } = await req.json();
  if (!message?.trim()) return Response.json({ error: 'Message required' }, { status: 400 });

  // ── Task lifecycle commands ──
  // Status flow: queued → pending_approval → approved → in-progress → completed/failed
  // Only pending_approval tasks can be approved/cancelled/changed
  const lowerMsg = message.trim().toLowerCase();

  // Show pending items
  if (lowerMsg === 'show pending' || lowerMsg === 'pending' || lowerMsg === 'show tasks' || lowerMsg === 'dev status') {
    const { data: tasks } = await supabaseAdmin
      .from('task_queue')
      .select('id, title, status, result, updated_at')
      .eq('user_id', userId)
      .in('status', ['queued', 'in-progress'])
      .order('updated_at', { ascending: false })
      .limit(10);

    if (!tasks?.length) {
      return Response.json({ response: 'No pending dev tasks. Use `/dev`, `/ship`, or `/bug` to queue one.' });
    }

    // Determine display status based on status + result
    const getDisplayStatus = (t: { status: string; result: string | null }) => {
      if (t.status === 'in-progress') {
        try {
          const r = JSON.parse(t.result || '{}');
          if (r.approved) return { emoji: '\u{1F527}', label: 'Building...' };
        } catch {}
        return { emoji: '\u{1F527}', label: 'Executing...' };
      }
      if (t.status === 'queued' && t.result) {
        try {
          const r = JSON.parse(t.result);
          if (r.awaiting_approval) return { emoji: '\u{1F4CB}', label: 'Awaiting your approval' };
        } catch {}
      }
      return { emoji: '\u{23F3}', label: 'Queued (plan generating...)' };
    };

    const list = tasks.map(t => {
      const ds = getDisplayStatus(t);
      return `${ds.emoji} **${t.title}**\n   Status: ${ds.label}`;
    }).join('\n\n');

    return Response.json({
      response: `**Dev Pipeline:**\n\n${list}\n\n<!-- SHOW_APPROVAL_BUTTONS -->`,
    });
  }

  // Approve — find queued task with a plan (result contains awaiting_approval)
  if (lowerMsg === 'approve' || lowerMsg === 'go' || lowerMsg === 'yes, approve' || lowerMsg === 'approved' || lowerMsg === 'yes') {
    // Find task with plan awaiting approval
    const { data: allQueued } = await supabaseAdmin
      .from('task_queue')
      .select('id, title, result')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .not('result', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(5);

    const pending = allQueued?.find(t => {
      try { return JSON.parse(t.result).awaiting_approval; } catch { return false; }
    });

    if (pending) {
      // Mark plan as approved and set status to in-progress
      const planData = JSON.parse(pending.result);
      planData.approved = true;
      planData.awaiting_approval = false;

      await supabaseAdmin
        .from('task_queue')
        .update({ status: 'in-progress', result: JSON.stringify(planData), updated_at: new Date().toISOString() })
        .eq('id', pending.id);

      // Trigger executor immediately
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za';
      fetch(`${baseUrl}/api/cron/trigger`, { method: 'POST' }).catch(() => {});

      return Response.json({
        response: `\u{2705} **Approved: ${pending.title}**\n\nExecuting now...`,
      });
    }

    // Check if there's a queued task with no plan yet
    const { data: noPlan } = await supabaseAdmin
      .from('task_queue')
      .select('id, title')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .is('result', null)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (noPlan?.length) {
      return Response.json({
        response: `\u{23F3} **${noPlan[0].title}** is still being planned. The plan will appear here shortly.`,
      });
    }

    // Nothing to approve — don't let it fall through to AI
    return Response.json({
      response: 'No tasks pending approval. Use `/dev` to queue a new task, or `show pending` to see the pipeline.',
    });
  }

  // Cancel — use 'failed' status (allowed by constraint) with cancel marker
  if (lowerMsg === 'cancel' || lowerMsg === 'reject') {
    const { data: pending } = await supabaseAdmin
      .from('task_queue')
      .select('id, title')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (pending?.length) {
      await supabaseAdmin
        .from('task_queue')
        .update({ status: 'failed', result: 'Cancelled by user', updated_at: new Date().toISOString() })
        .eq('id', pending[0].id);

      return Response.json({
        response: `\u{274C} **Cancelled: ${pending[0].title}**\n\nTask discarded.`,
      });
    }

    return Response.json({ response: 'No tasks to cancel.' });
  }

  // Change
  if (lowerMsg.startsWith('change:') || lowerMsg.startsWith('modify:') || lowerMsg.startsWith('adjust:')) {
    const feedback = message.slice(message.indexOf(':') + 1).trim();
    const { data: pending } = await supabaseAdmin
      .from('task_queue')
      .select('id, title, description')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (pending?.length) {
      await supabaseAdmin
        .from('task_queue')
        .update({
          status: 'queued',
          result: null, // Clear plan so it gets regenerated
          description: `${pending[0].description || ''}\n\n--- User feedback ---\n${feedback}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pending[0].id);

      return Response.json({
        response: `\u{270F}\u{FE0F} **Updated: ${pending[0].title}**\n\nI'll regenerate the plan with your feedback:\n> ${feedback}\n\nNew plan coming in a few minutes.`,
      });
    }
  }

  // Inject notepad context if available
  let notepadContext = '';
  try {
    const { data: noteData } = await supabaseAdmin
      .from('notes')
      .select('content')
      .eq('user_id', userId)
      .limit(1)
      .single();
    if (noteData?.content?.trim()) {
      notepadContext = `\n\nUser's strategic notepad (always-on context):\n${noteData.content.slice(0, 2000)}`;
    }
  } catch { /* no notepad */ }

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
    { role: 'user', content: message + kbContext + notepadContext },
  ];

  // Load learned rules once per turn and inject into the system prompt.
  const learnedRules = await getLearnedRules(userId);
  const systemPrompt = await getSystemPrompt(userId, learnedRules);

  // SSE stream — text chunks arrive in real-time, tool iterations happen server-side
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let finalResponse = '';
      let iterations = 0;
      const maxIterations = 10;
      let currentMessages = [...messages];

      try {
        while (iterations < maxIterations) {
          iterations++;

          const response = await anthropic.messages.create({
            model: pickModel('agent.tools'),
            max_tokens: 4096,
            system: systemPrompt,
            tools: CEREBRO_TOOLS,
            messages: currentMessages,
          });

          const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
          );
          const textBlocks = response.content.filter(
            (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
          );

          if (toolUseBlocks.length === 0) {
            // Final text response — stream it
            const text = textBlocks.map((b) => b.text).join('\n');
            finalResponse = text;
            emit({ type: 'text', content: text });
            break;
          }

          // Tool iteration — emit progress, execute tools, continue
          for (const toolUse of toolUseBlocks) {
            emit({ type: 'tool_call', name: toolUse.name });
          }

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

          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ];

          // Emit any intermediate text from tool iterations
          if (textBlocks.length > 0) {
            const interimText = textBlocks.map((b) => b.text).join('\n');
            if (interimText.trim()) {
              emit({ type: 'text', content: interimText + '\n\n' });
              finalResponse += interimText + '\n\n';
            }
          }

          if (response.stop_reason === 'end_turn') {
            break;
          }
        }

        // Save history + emit done event
        let assistantMessageId: string | null = null;
        try {
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
            await supabaseAdmin.from('chat_messages').insert({
              thread_id: thread.id,
              role: 'user',
              content: message,
            });

            if (finalResponse.trim()) {
              const { data: assistantRow } = await supabaseAdmin
                .from('chat_messages')
                .insert({
                  thread_id: thread.id,
                  role: 'assistant',
                  content: finalResponse.trim(),
                  model: 'claude-sonnet',
                })
                .select('id')
                .single();
              assistantMessageId = assistantRow?.id ?? null;
            }

            await supabaseAdmin
              .from('chat_threads')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', thread.id);
          }
        } catch { /* silent */ }

        emit({ type: 'done', iterations, assistant_message_id: assistantMessageId });

        // Fire-and-forget: bump hit counters
        if (finalResponse.trim()) {
          void bumpRuleHits(userId, finalResponse);
        }
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
    },
  });
}
