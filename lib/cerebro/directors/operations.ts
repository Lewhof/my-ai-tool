import { supabaseAdmin } from '@/lib/supabase-server';
import { getMicrosoftToken } from '@/lib/microsoft-token';

export const OPERATIONS_TOOLS = [
  'get_calendar',
  'create_calendar_event',
  'create_todo',
  'get_todos',
  'complete_todos',
  'update_todo',
  'delete_todo',
  'get_todo_stats',
  'create_whiteboard_item',
  'get_whiteboard',
  'get_emails',
  'triage_emails',
  'get_credits',
  'push_to_claude_code',
  'save_learned_rule',
] as const;

export async function handle(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (toolName) {
      case 'get_calendar': {
        const days = (input.days_ahead as number) || 1;
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString();

        const { data: accounts } = await supabaseAdmin
          .from('calendar_accounts')
          .select('id, label, alias, provider')
          .eq('user_id', userId);

        if (!accounts?.length) return 'No calendar accounts connected. Go to Settings > Connections to add one.';

        const allEvents: Array<{ time: string; subject: string; label: string; startIso: string }> = [];
        for (const acc of accounts) {
          try {
            const token = await getMicrosoftToken(userId, acc.id);
            if (!token) continue;

            const res = await fetch(
              `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${start}&endDateTime=${end}&$orderby=start/dateTime&$top=20&$select=subject,start,end,location`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.ok) {
              const data = await res.json();
              const label = acc.alias || acc.label || 'Calendar';
              for (const e of data.value ?? []) {
                const startIso = e.start?.dateTime || '';
                allEvents.push({
                  time: startIso.slice(11, 16),
                  subject: e.subject,
                  label,
                  startIso,
                });
              }
            }
          } catch { /* skip failed account */ }
        }

        allEvents.sort((a, b) => a.startIso.localeCompare(b.startIso));
        return allEvents.length > 0
          ? `Calendar events:\n${allEvents.map(e => `${e.time} - ${e.subject} (${e.label})`).join('\n')}`
          : 'No events found for this period.';
      }

      case 'create_calendar_event': {
        return `Calendar event creation requested: "${input.subject}" on ${input.date} ${input.start_time}-${input.end_time}. Go to Calendar page to create events with your connected accounts.`;
      }

      case 'create_todo': {
        const { data, error } = await supabaseAdmin.from('todos').insert({
          user_id: userId,
          title: input.title as string,
          description: (input.description as string) || null,
          priority: (input.priority as string) || 'medium',
          due_date: (input.due_date as string) || null,
        }).select('id, title').single();

        if (error) return `Error creating task: ${error.message}`;
        return `Task created: "${data.title}" (ID: ${data.id})`;
      }

      case 'complete_todos': {
        const titles = (input.titles as string[]) ?? [];
        if (titles.length === 0) return 'Error: no titles provided.';

        const { data: allTodos, error: fetchErr } = await supabaseAdmin
          .from('todos')
          .select('id, title, status')
          .eq('user_id', userId)
          .neq('status', 'done');

        if (fetchErr) return `Error fetching tasks: ${fetchErr.message}`;
        if (!allTodos || allTodos.length === 0) return 'No active tasks to complete.';

        const matched: Array<{ id: string; title: string; matchedAs: string }> = [];
        const notFound: string[] = [];
        const usedIds = new Set<string>();

        for (const search of titles) {
          const needle = search.toLowerCase().trim();
          if (!needle) continue;

          let best: { id: string; title: string; score: number } | null = null;
          for (const todo of allTodos) {
            if (usedIds.has(todo.id)) continue;
            const hay = (todo.title || '').toLowerCase();
            let score = 0;
            if (hay === needle) score = 100;
            else if (hay.startsWith(needle)) score = 80;
            else if (hay.includes(needle)) score = 60;
            else {
              const needleWords: string[] = needle.split(/\s+/).filter((w: string) => w.length > 2);
              const hayWords: string[] = hay.split(/\s+/);
              const overlap = needleWords.filter((nw: string) => hayWords.some((hw: string) => hw.includes(nw) || nw.includes(hw))).length;
              if (overlap > 0) score = 30 + overlap * 10;
            }

            if (score > 0 && (!best || score > best.score)) {
              best = { id: todo.id, title: todo.title, score };
            }
          }

          if (best) {
            matched.push({ id: best.id, title: best.title, matchedAs: search });
            usedIds.add(best.id);
          } else {
            notFound.push(search);
          }
        }

        let completedCount = 0;
        const completed: string[] = [];
        for (const m of matched) {
          const { error: updErr } = await supabaseAdmin
            .from('todos')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .eq('id', m.id)
            .eq('user_id', userId);
          if (!updErr) {
            completedCount++;
            completed.push(m.title);
          }
        }

        let result = '';
        if (completedCount > 0) {
          result += `Completed ${completedCount} task${completedCount !== 1 ? 's' : ''}:\n${completed.map(t => `- ${t}`).join('\n')}`;
        } else {
          result += 'No tasks were marked complete.';
        }
        if (notFound.length > 0) {
          result += `\n\nCould not find matches for: ${notFound.join(', ')}`;
        }
        return result;
      }

      case 'update_todo': {
        const id = input.id as string | undefined;
        const titleMatch = input.title_match as string | undefined;

        let todoId = id;
        let todoTitle = '';
        if (!todoId && titleMatch) {
          const { data: candidates } = await supabaseAdmin
            .from('todos')
            .select('id, title')
            .eq('user_id', userId)
            .neq('status', 'done')
            .ilike('title', `%${titleMatch}%`)
            .limit(5);

          if (!candidates || candidates.length === 0) {
            return `No active task found matching "${titleMatch}".`;
          }
          if (candidates.length > 1) {
            return `Multiple tasks match "${titleMatch}": ${candidates.map(c => `"${c.title}"`).join(', ')}. Please be more specific.`;
          }
          todoId = candidates[0].id;
          todoTitle = candidates[0].title;
        }

        if (!todoId) return 'Error: must provide id or title_match';

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.title !== undefined) updates.title = input.title;
        if (input.description !== undefined) updates.description = input.description || null;
        if (input.priority !== undefined) updates.priority = input.priority;
        if (input.due_date !== undefined) updates.due_date = input.due_date || null;
        if (input.status !== undefined) updates.status = input.status;
        if (input.bucket !== undefined) updates.bucket = input.bucket;

        if (Object.keys(updates).length === 1) {
          return 'Error: no fields to update.';
        }

        const { data, error } = await supabaseAdmin
          .from('todos')
          .update(updates)
          .eq('id', todoId)
          .eq('user_id', userId)
          .select('title, status')
          .single();

        if (error) return `Error updating task: ${error.message}`;
        return `Updated task "${data?.title || todoTitle}" (status: ${data?.status || 'unchanged'}).`;
      }

      case 'delete_todo': {
        const id = input.id as string | undefined;
        const titleMatch = input.title_match as string | undefined;

        let todoId = id;
        let deletedTitle = '';
        if (!todoId && titleMatch) {
          const { data: candidates } = await supabaseAdmin
            .from('todos')
            .select('id, title')
            .eq('user_id', userId)
            .ilike('title', `%${titleMatch}%`)
            .limit(5);

          if (!candidates || candidates.length === 0) {
            return `No task found matching "${titleMatch}".`;
          }
          if (candidates.length > 1) {
            return `Multiple tasks match "${titleMatch}": ${candidates.map(c => `"${c.title}"`).join(', ')}. Please be more specific.`;
          }
          todoId = candidates[0].id;
          deletedTitle = candidates[0].title;
        }

        if (!todoId) return 'Error: must provide id or title_match';

        const { error } = await supabaseAdmin
          .from('todos')
          .delete()
          .eq('id', todoId)
          .eq('user_id', userId);

        if (error) return `Error deleting task: ${error.message}`;
        return `Deleted task "${deletedTitle || todoId}".`;
      }

      case 'get_todos': {
        const status = input.status as string || 'all';
        let query = supabaseAdmin.from('todos').select('id, title, status, priority, due_date').eq('user_id', userId);
        if (status !== 'all') query = query.eq('status', status);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);

        if (!data?.length) return 'No tasks found.';
        return `Tasks:\n${data.map((t) => `- [${t.status}] ${t.title} (${t.priority}${t.due_date ? `, due ${t.due_date}` : ''})`).join('\n')}`;
      }

      case 'get_todo_stats': {
        const { data: todos } = await supabaseAdmin
          .from('todos')
          .select('status, priority, due_date')
          .eq('user_id', userId);

        if (!todos?.length) return 'No tasks found.';

        const byStatus: Record<string, number> = {};
        const byPriority: Record<string, number> = {};
        let overdue = 0;
        const today = new Date().toISOString().split('T')[0];

        for (const t of todos) {
          byStatus[t.status] = (byStatus[t.status] || 0) + 1;
          byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
          if (t.due_date && t.due_date < today && t.status !== 'done') overdue++;
        }

        const total = todos.length;
        const done = byStatus['done'] || 0;
        const rate = total > 0 ? Math.round((done / total) * 100) : 0;

        return `Task stats:\n` +
          `Total: ${total} | Done: ${done} | Completion rate: ${rate}%\n` +
          `By status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', ')}\n` +
          `By priority: ${Object.entries(byPriority).map(([k, v]) => `${k}=${v}`).join(', ')}\n` +
          `Overdue: ${overdue}`;
      }

      case 'create_whiteboard_item': {
        const { data, error } = await supabaseAdmin.from('whiteboard').insert({
          user_id: userId,
          title: input.title as string,
          description: (input.description as string) || null,
          tags: (input.tags as string[]) || [],
        }).select('id, title').single();

        if (error) return `Error: ${error.message}`;
        return `Whiteboard item created: "${data.title}" (ID: ${data.id})`;
      }

      case 'get_whiteboard': {
        const status = input.status as string || 'all';
        let query = supabaseAdmin.from('whiteboard').select('id, title, status, priority, tags').eq('user_id', userId);
        if (status !== 'all') query = query.eq('status', status);
        const { data } = await query.order('priority', { ascending: true }).limit(20);

        if (!data?.length) return 'No whiteboard items found.';
        return `Whiteboard:\n${data.map((i) => `- #${i.priority} [${i.status}] ${i.title} (${(i.tags as string[]).join(', ')})`).join('\n')}`;
      }

      case 'get_emails': {
        const folder = (input.folder as string) || 'inbox';
        const limit = (input.limit as number) || 10;

        const { data: accounts } = await supabaseAdmin
          .from('calendar_accounts')
          .select('id, label, alias, email, provider')
          .eq('user_id', userId)
          .in('provider', ['microsoft', 'microsoft-work']);

        if (!accounts || accounts.length === 0) {
          return 'No Microsoft account connected. Go to Settings > Connections.';
        }

        const folderMap: Record<string, string> = { inbox: 'inbox', sent: 'sentitems', drafts: 'drafts' };
        const graphFolder = folderMap[folder] || 'inbox';
        const perAccountLimit = Math.max(5, Math.ceil(limit / accounts.length));

        type EmailEntry = { label: string; line: string; date: string; isRead: boolean };
        const allEmails: EmailEntry[] = [];

        for (const account of accounts) {
          try {
            const token = await getMicrosoftToken(userId, account.id);
            if (!token) continue;

            const res = await fetch(
              `https://graph.microsoft.com/v1.0/me/mailFolders/${graphFolder}/messages?$top=${perAccountLimit}&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,isRead,bodyPreview`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) continue;
            const data = await res.json();
            const label = account.alias || account.label || 'Email';

            for (const e of (data.value ?? []) as Record<string, unknown>[]) {
              const from = (e.from as Record<string, Record<string, string>>)?.emailAddress;
              const unread = e.isRead ? '' : '[UNREAD] ';
              const line = `- ${unread}[${label}] ${e.subject} — from ${from?.name || from?.address || 'unknown'} (${(e.bodyPreview as string)?.slice(0, 80)})`;
              allEmails.push({ label, line, date: e.receivedDateTime as string, isRead: !!e.isRead });
            }
          } catch { /* skip failing account */ }
        }

        if (allEmails.length === 0) return 'No emails found across connected accounts.';

        allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const top = allEmails.slice(0, limit);
        const unreadCount = allEmails.filter(e => !e.isRead).length;

        return `Emails (${folder}, ${accounts.length} account${accounts.length > 1 ? 's' : ''}, ${unreadCount} unread):\n${top.map(e => e.line).join('\n')}`;
      }

      case 'triage_emails': {
        return 'Email triage requires the AI triage endpoint. Go to the Email page and click "AI Triage" for a categorized view of your unread emails.';
      }

      case 'get_credits': {
        const heliconeKey = process.env.HELICONE_API_KEY;
        if (!heliconeKey) return 'Helicone not configured.';

        const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
        const thirtyDaysAgoMs = Date.now() - 30 * 86400000;
        const res = await fetch('https://api.helicone.ai/v1/request/query', {
          method: 'POST',
          headers: { Authorization: `Bearer ${heliconeKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: { request: { created_at: { gte: ninetyDaysAgo } } }, limit: 2000 }),
        });
        if (!res.ok) return 'Could not fetch credits data.';
        const data = await res.json();
        const requests: Array<{
          response_cost_usd?: number;
          request_created_at?: string;
          created_at?: string;
        }> = data.data ?? [];

        const recent = requests.filter(r => {
          const ts = new Date(r.request_created_at ?? r.created_at ?? 0).getTime();
          return ts >= thirtyDaysAgoMs;
        });
        const totalCost = recent.reduce((sum, r) => sum + (r.response_cost_usd ?? 0), 0);

        const { data: billing } = await supabaseAdmin
          .from('billing_state')
          .select('starting_balance_usd, set_at, alert_threshold_usd')
          .eq('user_id', userId)
          .eq('provider', 'anthropic')
          .maybeSingle();

        let balanceLine = '\nAnthropic balance: not configured. User can set it on /credits page.';
        if (billing) {
          const setAt = new Date(billing.set_at).getTime();
          const spentSince = requests
            .filter(r => {
              const ts = new Date(r.request_created_at ?? r.created_at ?? 0).getTime();
              return ts >= setAt;
            })
            .reduce((sum, r) => sum + (r.response_cost_usd ?? 0), 0);
          const starting = Number(billing.starting_balance_usd);
          const threshold = Number(billing.alert_threshold_usd);
          const remaining = Math.max(0, starting - spentSince);
          const lowFlag = remaining < threshold ? ' ⚠ LOW' : '';
          balanceLine = `\nAnthropic balance: $${remaining.toFixed(4)} remaining${lowFlag} (started at $${starting.toFixed(2)} on ${new Date(billing.set_at).toLocaleDateString()}, spent $${spentSince.toFixed(4)} since).`;
        }

        return `AI Usage (30 days): ${recent.length} requests, $${totalCost.toFixed(4)} total cost.${balanceLine}`;
      }

      case 'push_to_claude_code': {
        const title = input.title as string;
        const description = (input.description as string) || '';

        const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
        const { data: existing } = await supabaseAdmin
          .from('task_queue')
          .select('id, title, status')
          .eq('user_id', userId)
          .ilike('title', title)
          .gte('created_at', oneDayAgo)
          .limit(1);

        if (existing?.length) {
          return `Task "${title}" already exists in the queue (status: ${existing[0].status}). No duplicate created.`;
        }

        const { data, error } = await supabaseAdmin.from('task_queue').insert({
          user_id: userId,
          title,
          description,
          status: 'queued',
        }).select('id').single();

        if (error) return `Error queuing task: ${error.message}`;

        await supabaseAdmin.from('whiteboard').insert({
          user_id: userId,
          title,
          description,
          status: 'in-progress',
          tags: ['claude-code', 'agent-pushed'],
        });

        return `Development task queued for Claude Code: "${title}" (ID: ${data.id}). It will be picked up in the next Claude Code session.`;
      }

      case 'save_learned_rule': {
        const rule = (input.rule as string | undefined)?.trim();
        const category = (input.category as string | undefined) || 'prefer';
        if (!rule) return 'Error: rule text required';
        if (!['do', 'dont', 'prefer'].includes(category)) {
          return 'Error: category must be do, dont, or prefer';
        }

        const { data: existing } = await supabaseAdmin
          .from('cerebro_rules')
          .select('id')
          .eq('user_id', userId)
          .eq('rule', rule)
          .eq('active', true)
          .limit(1);

        if (existing?.length) {
          return `Rule already exists: "${rule}"`;
        }

        const { error } = await supabaseAdmin.from('cerebro_rules').insert({
          user_id: userId,
          rule,
          category,
          source: 'self',
          active: true,
        });

        if (error) return `Error saving rule: ${error.message}`;
        return `Saved ${category} rule: "${rule}". I'll apply this in future conversations.`;
      }

      default:
        return `Unknown tool in operations director: ${toolName}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}
