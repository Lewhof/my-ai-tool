import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { executeTool } from '@/lib/agent/executor';
import { sendPushToUser } from '@/lib/push';

// Cron endpoint — called by Vercel Cron every 5 minutes
// Secured by CRON_SECRET header
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();

  // Find all scheduled agents that are due
  const { data: dueAgents } = await supabaseAdmin
    .from('user_agents')
    .select('*')
    .eq('trigger_type', 'scheduled')
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString());

  if (!dueAgents?.length) {
    return Response.json({ executed: 0 });
  }

  let executed = 0;

  for (const agent of dueAgents) {
    try {
      // Create run record
      const { data: run } = await supabaseAdmin
        .from('agent_runs')
        .insert({ agent_id: agent.id, status: 'running' })
        .select('id')
        .single();

      // Execute prompt
      const response = await anthropic.messages.create({
        model: MODELS.fast,
        max_tokens: 2000,
        system: `You are an autonomous AI agent. Execute the following task. Current time: ${now.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}`,
        messages: [{ role: 'user', content: agent.prompt }],
      });

      const output = response.content[0].type === 'text' ? response.content[0].text : '';

      // Execute actions
      const actionsTaken: Array<{ type: string; result: string }> = [];
      for (const action of (agent.actions as Array<{ type: string }>) ?? []) {
        try {
          if (action.type === 'create_todo') {
            const result = await executeTool('create_todo', { title: `[${agent.name}] Action`, description: output.slice(0, 200) }, agent.user_id);
            actionsTaken.push({ type: 'create_todo', result });
          } else if (action.type === 'save_note') {
            const result = await executeTool('save_note', { title: `[${agent.name}] ${now.toLocaleDateString()}`, content: output }, agent.user_id);
            actionsTaken.push({ type: 'save_note', result });
          }
        } catch { /* skip failed action */ }
      }

      // Update run
      await supabaseAdmin.from('agent_runs').update({
        status: 'completed', output, actions_taken: actionsTaken,
      }).eq('id', run?.id);

      // Calculate next run based on schedule
      let nextRun = new Date(now.getTime() + 86400000); // Default: 24h
      const schedule = agent.schedule as string;
      if (schedule === 'hourly') nextRun = new Date(now.getTime() + 3600000);
      else if (schedule === 'daily') nextRun = new Date(now.getTime() + 86400000);
      else if (schedule === 'weekly') nextRun = new Date(now.getTime() + 7 * 86400000);
      else if (schedule === 'monthly') { nextRun = new Date(now); nextRun.setMonth(nextRun.getMonth() + 1); }
      else if (schedule?.includes('*/')) {
        const mins = parseInt(schedule.replace('*/', ''), 10);
        if (mins > 0) nextRun = new Date(now.getTime() + mins * 60000);
      }

      await supabaseAdmin.from('user_agents').update({
        last_run_at: now.toISOString(),
        next_run_at: nextRun.toISOString(),
      }).eq('id', agent.id);

      executed++;
    } catch { /* skip failed agent */ }
  }

  // Check for overdue tasks (once per hour — only at minute 0-4)
  if (now.getMinutes() < 5) {
    try {
      const today = now.toISOString().split('T')[0];
      const { data: overdueTasks } = await supabaseAdmin
        .from('todos')
        .select('user_id, title')
        .neq('status', 'done')
        .lt('due_date', today)
        .limit(20);

      if (overdueTasks?.length) {
        const byUser = overdueTasks.reduce((acc, t) => {
          if (!acc[t.user_id]) acc[t.user_id] = [];
          acc[t.user_id].push(t.title);
          return acc;
        }, {} as Record<string, string[]>);

        for (const [uid, titles] of Object.entries(byUser)) {
          await sendPushToUser(uid, {
            title: `${titles.length} overdue task${titles.length > 1 ? 's' : ''}`,
            body: titles.slice(0, 3).join(', '),
            tag: 'task-overdue',
            url: '/todos',
          });
        }
      }
    } catch { /* skip */ }
  }

  return Response.json({ executed, timestamp: now.toISOString() });
}
