import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { sendPushToUser } from '@/lib/push';

// Autonomous task executor — runs every 5 min via Vercel Cron
// Picks up queued tasks, generates plan, waits for approval, executes
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 1. Find tasks waiting for execution (status = 'queued')
  const { data: queuedTasks } = await supabaseAdmin
    .from('task_queue')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(3);

  if (!queuedTasks?.length) {
    // 2. Check for approved tasks ready to execute
    const { data: approvedTasks } = await supabaseAdmin
      .from('task_queue')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .limit(1);

    if (approvedTasks?.length) {
      await executeTask(approvedTasks[0]);
    }

    return Response.json({ queued: 0, executed: approvedTasks?.length ?? 0 });
  }

  let planned = 0;

  for (const task of queuedTasks) {
    try {
      // Generate a plan
      const plan = await generatePlan(task);

      // Update task with plan, set status to 'pending_approval'
      await supabaseAdmin
        .from('task_queue')
        .update({
          status: 'pending_approval',
          result: JSON.stringify({ plan }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      // Send plan to Cerebro conversation thread
      await supabaseAdmin.from('agent_thread').insert({
        user_id: task.user_id,
        role: 'assistant',
        content: `\u{1F4CB} **Task Plan: ${task.title}**\n\n${plan}\n\n---\n\u{2705} Reply **"approve"** to execute this plan\n\u{270F}\u{FE0F} Reply **"change: [your feedback]"** to adjust\n\u{274C} Reply **"cancel"** to discard`,
      });

      // Push notification
      await sendPushToUser(task.user_id, {
        title: 'Task plan ready',
        body: `${task.title} — review and approve in Cerebro`,
        tag: 'task-plan',
        url: '/agent',
      });

      planned++;
    } catch { /* skip failed tasks */ }
  }

  return Response.json({ planned, timestamp: new Date().toISOString() });
}

async function generatePlan(task: { title: string; description: string | null }): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODELS.smart,
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are a senior developer planning a task for a Next.js 16 + Supabase + Tailwind app.

Task: ${task.title}
${task.description ? `Details: ${task.description}` : ''}

Generate a concise implementation plan with:
1. **Files to create/modify** (list each file path)
2. **Key changes** (2-3 bullet points per file)
3. **Dependencies** (any new packages needed)
4. **Estimated complexity** (small/medium/large)

Be specific and actionable. The plan will be executed autonomously via GitHub API.`,
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : 'Could not generate plan.';
}

async function executeTask(task: { id: string; user_id: string; title: string; description: string | null; result: string | null }) {
  // Mark as executing
  await supabaseAdmin
    .from('task_queue')
    .update({ status: 'in-progress', updated_at: new Date().toISOString() })
    .eq('id', task.id);

  try {
    // Generate the actual code changes
    const response = await anthropic.messages.create({
      model: MODELS.smart,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are an autonomous code generator for a Next.js 16 + Supabase + Tailwind app.

Task: ${task.title}
${task.description ? `Details: ${task.description}` : ''}
${task.result ? `Approved plan: ${task.result}` : ''}

Generate the implementation as a JSON array of file operations:
[
  { "path": "app/api/example/route.ts", "action": "create", "content": "file content here" },
  { "path": "components/example.tsx", "action": "create", "content": "file content here" }
]

Rules:
- Use TypeScript, Tailwind CSS v4 design tokens (bg-card, text-foreground, border-border etc)
- Import from @/lib/utils, @/lib/supabase-server as needed
- Follow existing patterns in the codebase
- Return ONLY valid JSON array, no markdown

Only include files that need to be created or modified.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let files: Array<{ path: string; action: string; content: string }>;

    try {
      files = JSON.parse(json);
    } catch {
      throw new Error('Could not parse generated code');
    }

    // Create files via GitHub API
    const owner = process.env.GITHUB_OWNER || 'Lewhof';
    const repo = process.env.GITHUB_REPO || 'my-ai-tool';
    const token = process.env.GITHUB_TOKEN;

    if (!token) throw new Error('No GitHub token configured');

    // Get current main branch SHA
    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/main`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    const refData = await refRes.json();
    const baseSha = refData.object?.sha;

    if (!baseSha) throw new Error('Could not get main branch SHA');

    // Create blobs and tree for all files
    const blobs = await Promise.all(
      files.map(async (f) => {
        const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
        });
        const blob = await blobRes.json();
        return { path: f.path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha };
      })
    );

    // Create tree
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseSha, tree: blobs }),
    });
    const tree = await treeRes.json();

    // Create commit
    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Auto: ${task.title}\n\nExecuted autonomously via Cerebro task queue.\n\nCo-Authored-By: Cerebro AI <noreply@lewhofmeyr.co.za>`,
        tree: tree.sha,
        parents: [baseSha],
      }),
    });
    const commit = await commitRes.json();

    // Update main branch
    await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`, {
      method: 'PATCH',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha }),
    });

    // Mark task as completed
    await supabaseAdmin
      .from('task_queue')
      .update({
        status: 'completed',
        result: `Committed ${files.length} file(s). Commit: ${commit.sha?.slice(0, 7)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);

    // Update whiteboard if linked
    if (task.id) {
      await supabaseAdmin
        .from('whiteboard')
        .update({ status: 'done' })
        .eq('id', task.id);
    }

    // Notify user
    await supabaseAdmin.from('agent_thread').insert({
      user_id: task.user_id,
      role: 'assistant',
      content: `\u{2705} **Task completed: ${task.title}**\n\nCommitted ${files.length} file(s) to main. Vercel will deploy automatically.\n\nCommit: \`${commit.sha?.slice(0, 7)}\``,
    });

    await sendPushToUser(task.user_id, {
      title: 'Task completed',
      body: `${task.title} — deployed to production`,
      tag: 'task-complete',
      url: '/agent',
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Execution failed';

    await supabaseAdmin
      .from('task_queue')
      .update({ status: 'failed', result: errMsg, updated_at: new Date().toISOString() })
      .eq('id', task.id);

    await supabaseAdmin.from('agent_thread').insert({
      user_id: task.user_id,
      role: 'assistant',
      content: `\u{274C} **Task failed: ${task.title}**\n\nError: ${errMsg}\n\nYou can retry by telling me to re-queue this task.`,
    });

    await sendPushToUser(task.user_id, {
      title: 'Task failed',
      body: `${task.title} — ${errMsg.slice(0, 80)}`,
      tag: 'task-failed',
      url: '/agent',
    });
  }
}
