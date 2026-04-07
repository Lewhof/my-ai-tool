import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { executeTool } from './executor';

export type EventType =
  | 'document.uploaded'
  | 'todo.overdue'
  | 'whiteboard.created'
  | 'email.important';

export async function fireEvent(eventType: EventType, userId: string, context: Record<string, unknown>) {
  // Find agents listening for this event
  const { data: agents } = await supabaseAdmin
    .from('user_agents')
    .select('*')
    .eq('user_id', userId)
    .eq('trigger_type', 'event')
    .eq('trigger_event', eventType)
    .eq('enabled', true);

  if (!agents?.length) return;

  for (const agent of agents) {
    try {
      // Create run record
      const { data: run } = await supabaseAdmin
        .from('agent_runs')
        .insert({ agent_id: agent.id, status: 'running' })
        .select('id')
        .single();

      // Build prompt with event context
      const contextStr = Object.entries(context)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n');

      const fullPrompt = `${agent.prompt}\n\nEvent: ${eventType}\nContext:\n${contextStr}`;

      const response = await anthropic.messages.create({
        model: MODELS.fast,
        max_tokens: 1000,
        system: `You are an autonomous AI agent triggered by an event. Execute the task based on the event context. Current time: ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}`,
        messages: [{ role: 'user', content: fullPrompt }],
      });

      const output = response.content[0].type === 'text' ? response.content[0].text : '';

      // Execute actions
      const actionsTaken: Array<{ type: string; result: string }> = [];
      for (const action of (agent.actions as Array<{ type: string }>) ?? []) {
        try {
          if (action.type === 'create_todo') {
            const result = await executeTool('create_todo', { title: `[${agent.name}] ${(context.name as string) || 'Action'}`, description: output.slice(0, 200) }, userId);
            actionsTaken.push({ type: 'create_todo', result });
          } else if (action.type === 'save_note') {
            const result = await executeTool('save_note', { title: `[${agent.name}] ${new Date().toLocaleDateString()}`, content: output }, userId);
            actionsTaken.push({ type: 'save_note', result });
          } else if (action.type === 'update_whiteboard') {
            const result = await executeTool('create_whiteboard_item', { title: `[${agent.name}] Result`, description: output, tags: ['agent-output', eventType] }, userId);
            actionsTaken.push({ type: 'update_whiteboard', result });
          }
        } catch { /* skip */ }
      }

      await supabaseAdmin.from('agent_runs').update({
        status: 'completed', output, actions_taken: actionsTaken,
      }).eq('id', run?.id);

      await supabaseAdmin.from('user_agents').update({
        last_run_at: new Date().toISOString(),
      }).eq('id', agent.id);

    } catch { /* skip failed agent */ }
  }
}
