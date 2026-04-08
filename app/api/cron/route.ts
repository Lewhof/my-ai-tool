import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { executeTool } from '@/lib/agent/executor';
import { sendPushToUser } from '@/lib/push';
import { gatherBriefingData, generateBriefing, formatBriefingForTelegram } from '@/lib/briefing';
import { sendTelegramMessage, getTelegramChatId } from '@/lib/telegram';

// Helper: post a message to a user's Cerebro thread
async function postToCerebro(userId: string, content: string) {
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
      role: 'assistant',
      content,
      model: 'system',
    });
    await supabaseAdmin.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', thread.id);
  }
}

// Unified cron endpoint — runs every 5 minutes
// Handles: scheduled agents, overdue task alerts, task executor
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const validCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const validApiKey = req.headers.get('x-api-key') === process.env.ANTHROPIC_API_KEY;
  // Vercel Cron sends its own auth automatically — also accept ANTHROPIC_API_KEY for manual triggers
  if (!validCron && !validApiKey && authHeader !== `Bearer ${process.env.ANTHROPIC_API_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const results: Record<string, unknown> = {};

  // ── 1. Scheduled Agents ──
  try {
    const { data: dueAgents } = await supabaseAdmin
      .from('user_agents')
      .select('*')
      .eq('trigger_type', 'scheduled')
      .eq('enabled', true)
      .lte('next_run_at', now.toISOString());

    let agentsExecuted = 0;

    for (const agent of dueAgents ?? []) {
      try {
        const { data: run } = await supabaseAdmin
          .from('agent_runs')
          .insert({ agent_id: agent.id, status: 'running' })
          .select('id')
          .single();

        const response = await anthropic.messages.create({
          model: MODELS.fast,
          max_tokens: 2000,
          system: `You are an autonomous AI agent. Execute the following task. Current time: ${now.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}`,
          messages: [{ role: 'user', content: agent.prompt }],
        });

        const output = response.content[0].type === 'text' ? response.content[0].text : '';

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
          } catch { /* skip */ }
        }

        await supabaseAdmin.from('agent_runs').update({ status: 'completed', output, actions_taken: actionsTaken }).eq('id', run?.id);

        let nextRun = new Date(now.getTime() + 86400000);
        const schedule = agent.schedule as string;
        if (schedule === 'hourly') nextRun = new Date(now.getTime() + 3600000);
        else if (schedule === 'daily') nextRun = new Date(now.getTime() + 86400000);
        else if (schedule === 'weekly') nextRun = new Date(now.getTime() + 7 * 86400000);
        else if (schedule === 'monthly') { nextRun = new Date(now); nextRun.setMonth(nextRun.getMonth() + 1); }
        else if (schedule?.includes('*/')) {
          const mins = parseInt(schedule.replace('*/', ''), 10);
          if (mins > 0) nextRun = new Date(now.getTime() + mins * 60000);
        }

        await supabaseAdmin.from('user_agents').update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() }).eq('id', agent.id);
        agentsExecuted++;
      } catch { /* skip */ }
    }
    results.agents = agentsExecuted;
  } catch { results.agents = 'error'; }

  // ── 2. Overdue Task Alerts (once per hour) ──
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
      results.overdue = overdueTasks?.length ?? 0;
    } catch { results.overdue = 'error'; }
  }

  // ── 3. Task Executor ──
  // Lifecycle (only DB-allowed statuses):
  //   queued (result=null)     → needs plan generation
  //   queued (result has plan) → awaiting user approval
  //   in-progress              → approved, executing code
  //   completed                → done
  //   failed                   → error
  try {
    // 3a. Generate plans for queued tasks WITHOUT a plan yet
    const { data: queuedTasks } = await supabaseAdmin
      .from('task_queue')
      .select('*')
      .eq('status', 'queued')
      .is('result', null)
      .order('created_at', { ascending: true })
      .limit(2);

    let planned = 0;
    for (const task of queuedTasks ?? []) {
      try {
        const planResponse = await anthropic.messages.create({
          model: MODELS.smart,
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `You are a senior developer planning a task for a Next.js 16 + Supabase + Tailwind app.

Task: ${task.title}
${task.description ? `Details: ${task.description}` : ''}

Generate a concise implementation plan:
1. **Files to create/modify** (list paths)
2. **Key changes** (2-3 bullets per file)
3. **Estimated complexity** (small/medium/large)

Be specific and actionable.`,
          }],
        });

        const plan = planResponse.content[0].type === 'text' ? planResponse.content[0].text : 'Could not generate plan.';

        // Store plan in result — task stays queued, awaiting approval
        await supabaseAdmin.from('task_queue').update({
          result: JSON.stringify({ plan, awaiting_approval: true }),
          updated_at: now.toISOString(),
        }).eq('id', task.id);

        await postToCerebro(task.user_id, `\u{1F4CB} **Task Plan: ${task.title}**\n\n${plan}\n\n---\n\u{2705} Reply **"approve"** to execute\n\u{270F}\u{FE0F} Reply **"change: [feedback]"** to adjust\n\u{274C} Reply **"cancel"** to discard`);

        await sendPushToUser(task.user_id, {
          title: 'Task plan ready',
          body: `${task.title} \u2014 review in Cerebro`,
          tag: 'task-plan',
          url: '/agent',
        });

        planned++;
      } catch { /* skip */ }
    }
    results.planned = planned;

    // 3b. Execute tasks that are in-progress (user approved → set to in-progress)
    const { data: execTasks } = await supabaseAdmin
      .from('task_queue')
      .select('*')
      .eq('status', 'in-progress')
      .not('result', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(1);

    // Filter to only tasks whose result contains a plan (not already executing)
    const taskToExecute = execTasks?.find(t => {
      try {
        const r = JSON.parse(t.result);
        return r.plan && r.approved;
      } catch { return false; }
    });

    if (taskToExecute) {
      const task = taskToExecute;
      try {
        const codeResponse = await anthropic.messages.create({
          model: MODELS.smart,
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: `You are an autonomous code generator for a Next.js 16 + Supabase + Tailwind app.

Task: ${task.title}
${task.description ? `Details: ${task.description}` : ''}
${task.result ? `Approved plan: ${task.result}` : ''}

Generate the implementation as a JSON array of file operations:
[{"path":"app/example/page.tsx","action":"create","content":"..."}]

Rules: TypeScript, Tailwind CSS v4 tokens (bg-card, text-foreground, border-border), import from @/lib/utils.
Return ONLY valid JSON array.`,
          }],
        });

        const text = codeResponse.content[0].type === 'text' ? codeResponse.content[0].text : '';
        const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const files: Array<{ path: string; action: string; content: string }> = JSON.parse(json);

        // Commit via GitHub API
        const owner = process.env.GITHUB_OWNER || 'Lewhof';
        const repo = process.env.GITHUB_REPO || 'my-ai-tool';
        const token = process.env.GITHUB_TOKEN;
        if (!token) throw new Error('No GitHub token');

        const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/main`, {
          headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
        });
        const baseSha = (await refRes.json()).object?.sha;
        if (!baseSha) throw new Error('Could not get main SHA');

        const blobs = await Promise.all(files.map(async (f) => {
          const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
            method: 'POST',
            headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
          });
          return { path: f.path, mode: '100644' as const, type: 'blob' as const, sha: (await blobRes.json()).sha };
        }));

        const tree = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
          method: 'POST',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ base_tree: baseSha, tree: blobs }),
        }).then(r => r.json());

        const commit = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
          method: 'POST',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Auto: ${task.title}\n\nCo-Authored-By: Cerebro AI <noreply@lewhofmeyr.co.za>`,
            tree: tree.sha,
            parents: [baseSha],
          }),
        }).then(r => r.json());

        await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`, {
          method: 'PATCH',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha: commit.sha }),
        });

        await supabaseAdmin.from('task_queue').update({
          status: 'completed',
          result: `Committed ${files.length} file(s). SHA: ${commit.sha?.slice(0, 7)}`,
          updated_at: now.toISOString(),
        }).eq('id', task.id);

        await postToCerebro(task.user_id, `\u{2705} **Completed: ${task.title}**\n\n${files.length} file(s) committed. Vercel deploying now.\n\nCommit: \`${commit.sha?.slice(0, 7)}\``);

        await sendPushToUser(task.user_id, {
          title: 'Task completed',
          body: `${task.title} \u2014 deployed`,
          tag: 'task-complete',
          url: '/agent',
        });

        results.executed = task.title;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed';
        await supabaseAdmin.from('task_queue').update({ status: 'failed', result: errMsg }).eq('id', task.id);
        await postToCerebro(task.user_id, `\u{274C} **Failed: ${task.title}**\n\n${errMsg}`);
        await sendPushToUser(task.user_id, { title: 'Task failed', body: errMsg.slice(0, 80), tag: 'task-failed', url: '/agent' });
        results.executed = 'failed';
      }
    }
  } catch { results.executor = 'error'; }

  // ── 4. Daily Briefing (6:30 AM SAST = 4:30 AM UTC, run at minute 25-34) ──
  if (now.getUTCHours() === 4 && now.getMinutes() >= 25 && now.getMinutes() < 35) {
    try {
      const { data: users } = await supabaseAdmin.from('todos').select('user_id').limit(50);
      const uniqueIds = [...new Set((users ?? []).map(u => u.user_id))];
      const today = now.toISOString().split('T')[0];

      for (const userId of uniqueIds) {
        // Skip if already generated today
        const { data: existing } = await supabaseAdmin.from('briefings').select('id').eq('user_id', userId).eq('date', today).limit(1);
        if (existing?.length) continue;

        // Generate briefing via shared function (weather, calendar, tasks, email, whiteboard)
        const data = await gatherBriefingData(userId);
        const result = await generateBriefing(userId, data);

        // 1. Push notification
        const firstLine = result.briefing.replace(/[#*`\n]/g, ' ').trim().split('.')[0];
        await sendPushToUser(userId, {
          title: '\u2615 Morning Briefing',
          body: firstLine.slice(0, 120),
          tag: 'briefing',
          url: '/',
        });

        // 2. Telegram delivery
        const chatId = getTelegramChatId();
        if (chatId) {
          const telegramMsg = formatBriefingForTelegram(result);
          await sendTelegramMessage(chatId, telegramMsg);
        }

        // 3. Post to Cerebro thread for history
        await postToCerebro(userId, `\u{1F4CB} **Morning Briefing \u2014 ${today}**\n\n${result.briefing}`);
      }
      results.briefing = 'sent';
    } catch { results.briefing = 'error'; }
  }

  // ── 5. Weekly Review (Monday 7 AM SAST = 5 AM UTC) ──
  if (now.getUTCHours() === 5 && now.getMinutes() < 5 && now.getDay() === 1) {
    try {
      const { data: users } = await supabaseAdmin.from('todos').select('user_id').limit(50);
      const uniqueIds = [...new Set((users ?? []).map(u => u.user_id))];

      for (const userId of uniqueIds) {
        // Gather last 7 days of data
        const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

        const [completedRes, overdueRes, createdRes, habitsRes] = await Promise.all([
          supabaseAdmin.from('todos').select('title').eq('user_id', userId).eq('status', 'done').gte('updated_at', weekAgo),
          supabaseAdmin.from('todos').select('title, due_date').eq('user_id', userId).neq('status', 'done').lt('due_date', now.toISOString().split('T')[0]),
          supabaseAdmin.from('todos').select('title').eq('user_id', userId).gte('created_at', weekAgo),
          supabaseAdmin.from('habits').select('name, current_streak, best_streak').eq('user_id', userId).eq('active', true),
        ]);

        const completed = completedRes.data ?? [];
        const overdue = overdueRes.data ?? [];
        const created = createdRes.data ?? [];
        const habits = habitsRes.data ?? [];

        const context = `
Weekly Review Data:
- Tasks completed this week: ${completed.length} (${completed.slice(0, 5).map(t => t.title).join(', ')})
- Tasks created this week: ${created.length}
- Currently overdue: ${overdue.length} (${overdue.slice(0, 3).map(t => t.title).join(', ')})
- Habit streaks: ${habits.map(h => `${h.name}: ${h.current_streak} days (best: ${h.best_streak})`).join(', ') || 'No habits tracked'}
- Completion rate: ${created.length > 0 ? Math.round((completed.length / created.length) * 100) : 0}%
        `.trim();

        const response = await anthropic.messages.create({
          model: MODELS.smart,
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `You are a personal AI chief of staff. Generate a concise weekly review (max 200 words, markdown). Structure:
1. Key wins this week
2. Items that slipped (overdue)
3. Habit streak report
4. One recommendation for next week
5. Focus areas for the coming week

Be direct and actionable.

${context}`,
          }],
        });

        const review = response.content[0].type === 'text' ? response.content[0].text : '';

        // Deliver via Telegram
        const chatId = getTelegramChatId();
        if (chatId) {
          const msg = `*Weekly Review \u2014 ${now.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg' })}*\n\n${review.replace(/\*\*/g, '*').replace(/^#{1,6}\s+/gm, '')}`;
          await sendTelegramMessage(chatId, msg);
        }

        // Push notification
        await sendPushToUser(userId, {
          title: '\u{1F4CA} Weekly Review',
          body: review.replace(/[#*`\n]/g, ' ').trim().split('.')[0].slice(0, 120),
          tag: 'weekly-review',
          url: '/',
        });

        // Post to Cerebro
        await postToCerebro(userId, `\u{1F4CA} **Weekly Review \u2014 ${now.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg' })}**\n\n${review}`);
      }
      results.weeklyReview = 'sent';
    } catch { results.weeklyReview = 'error'; }
  }

  return Response.json({ ...results, timestamp: now.toISOString() });
}
