import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { executeTool } from '@/lib/cerebro/executor';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const { data: agent } = await supabaseAdmin
    .from('user_agents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!agent) return new Response('Not found', { status: 404 });

  // Create run record
  const { data: run } = await supabaseAdmin
    .from('agent_runs')
    .insert({ agent_id: id, status: 'running' })
    .select('id')
    .single();

  const runId = run?.id;

  try {
    // Execute the agent's prompt
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 2000,
      system: `You are an autonomous AI agent. Execute the following task and provide a concise result. If the task requires data, describe what data you would need. Be actionable and specific.

Current date/time: ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}`,
      messages: [{ role: 'user', content: agent.prompt }],
    });

    const output = response.content[0].type === 'text' ? response.content[0].text : 'No output.';

    // Execute defined actions
    const actionsTaken: Array<{ type: string; result: string }> = [];
    const actions = (agent.actions as Array<{ type: string; config?: Record<string, unknown> }>) ?? [];

    for (const action of actions) {
      try {
        if (action.type === 'send_telegram' && process.env.TELEGRAM_BOT_TOKEN) {
          // Find the user's Telegram chat ID from recent messages
          // For now, just log it
          actionsTaken.push({ type: 'send_telegram', result: 'Telegram delivery requires chat ID setup' });
        } else if (action.type === 'create_todo') {
          const result = await executeTool('create_todo', {
            title: `[Agent: ${agent.name}] Action item`,
            description: output.slice(0, 200),
          }, userId);
          actionsTaken.push({ type: 'create_todo', result });
        } else if (action.type === 'save_note') {
          const result = await executeTool('save_note', {
            title: `[Agent: ${agent.name}] ${new Date().toLocaleDateString()}`,
            content: output,
          }, userId);
          actionsTaken.push({ type: 'save_note', result });
        } else if (action.type === 'update_whiteboard') {
          const result = await executeTool('create_whiteboard_item', {
            title: `[Agent: ${agent.name}] Result`,
            description: output,
            tags: ['agent-output'],
          }, userId);
          actionsTaken.push({ type: 'update_whiteboard', result });
        }
      } catch (err) {
        actionsTaken.push({ type: action.type, result: `Failed: ${err instanceof Error ? err.message : 'unknown'}` });
      }
    }

    // Update run record
    await supabaseAdmin
      .from('agent_runs')
      .update({ status: 'completed', output, actions_taken: actionsTaken })
      .eq('id', runId);

    // Update agent last_run_at
    await supabaseAdmin
      .from('user_agents')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', id);

    return Response.json({ output, actions_taken: actionsTaken });
  } catch (err) {
    await supabaseAdmin
      .from('agent_runs')
      .update({ status: 'failed', output: err instanceof Error ? err.message : 'Unknown error' })
      .eq('id', runId);

    return Response.json({ error: err instanceof Error ? err.message : 'Agent execution failed' }, { status: 500 });
  }
}
