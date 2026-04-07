import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Check for cached briefing first
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  try {
    const { data: cached } = await supabaseAdmin
      .from('briefings')
      .select('content')
      .eq('user_id', userId)
      .eq('date', today)
      .limit(1)
      .single();

    if (cached?.content) {
      // Still need stats, so continue below but skip AI generation
      const [todosRes2, whiteboardRes2] = await Promise.all([
        supabaseAdmin.from('todos').select('title, status, priority, due_date').eq('user_id', userId).neq('status', 'done').limit(10),
        supabaseAdmin.from('whiteboard').select('title, status, priority, created_at').eq('user_id', userId).neq('status', 'done').limit(10),
      ]);
      const todos2 = todosRes2.data ?? [];
      const overdue2 = todos2.filter(t => t.due_date && t.due_date < today);
      const dueToday2 = todos2.filter(t => t.due_date === today);
      return Response.json({
        briefing: cached.content,
        cached: true,
        stats: {
          activeTasks: todos2.length,
          overdue: overdue2.length,
          dueToday: dueToday2.length,
          whiteboardItems: (whiteboardRes2.data ?? []).length,
          staleItems: (whiteboardRes2.data ?? []).filter(w => w.status === 'idea' && (now.getTime() - new Date(w.created_at).getTime()) > 14 * 86400000).length,
        },
      });
    }
  } catch { /* no cache, generate fresh */ }

  // Gather data from all sources

  const [todosRes, whiteboardRes, docsRes, threadsRes, notepadRes] = await Promise.all([
    supabaseAdmin.from('todos').select('title, status, priority, due_date').eq('user_id', userId).neq('status', 'done').order('created_at', { ascending: false }).limit(10),
    supabaseAdmin.from('whiteboard').select('title, status, priority, created_at').eq('user_id', userId).neq('status', 'done').order('priority', { ascending: true }).limit(10),
    supabaseAdmin.from('documents').select('name, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('chat_threads').select('title, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(5),
    supabaseAdmin.from('notes').select('content').eq('user_id', userId).limit(1).single(),
  ]);

  const todos = todosRes.data ?? [];
  const whiteboard = whiteboardRes.data ?? [];

  // Check for overdue tasks
  const overdue = todos.filter((t) => t.due_date && t.due_date < today);
  const dueToday = todos.filter((t) => t.due_date === today);
  const staleItems = whiteboard.filter((w) => {
    const created = new Date(w.created_at);
    return w.status === 'idea' && (now.getTime() - created.getTime()) > 14 * 86400000;
  });

  // Get weather
  let weather = '';
  try {
    const wRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-26.2041&longitude=28.0473&current=temperature_2m,weather_code');
    if (wRes.ok) {
      const wData = await wRes.json();
      weather = `${wData.current.temperature_2m}°C`;
    }
  } catch { /* skip */ }

  // Get unread email count
  let unreadEmails = 0;
  try {
    const { data: accounts } = await supabaseAdmin
      .from('calendar_accounts')
      .select('access_token')
      .eq('user_id', userId)
      .eq('is_default', true)
      .limit(1);
    const token = accounts?.[0]?.access_token;
    if (token) {
      const emailRes = await fetch(
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead eq false&$count=true&$top=1',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (emailRes.ok) {
        const emailData = await emailRes.json();
        unreadEmails = emailData['@odata.count'] ?? emailData.value?.length ?? 0;
      }
    }
  } catch { /* skip */ }

  // Build context for AI briefing
  const context = `
Today: ${now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
Weather: ${weather || 'Unknown'}
Unread emails: ${unreadEmails}

Tasks (${todos.length} active):
${todos.map((t) => `- [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}`).join('\n') || 'No active tasks'}

Overdue: ${overdue.length > 0 ? overdue.map((t) => t.title).join(', ') : 'None'}
Due today: ${dueToday.length > 0 ? dueToday.map((t) => t.title).join(', ') : 'None'}

Whiteboard (${whiteboard.length} items):
${whiteboard.slice(0, 5).map((w) => `- [${w.status}] ${w.title}`).join('\n') || 'Empty'}
Stale items (14+ days in Idea): ${staleItems.length > 0 ? staleItems.map((s) => s.title).join(', ') : 'None'}

Recent documents: ${(docsRes.data ?? []).map((d) => d.name).join(', ') || 'None'}
Recent chats: ${(threadsRes.data ?? []).map((t) => t.title).join(', ') || 'None'}

User's strategic context: ${notepadRes.data?.content?.slice(0, 500) || 'Not set'}
  `.trim();

  // Generate briefing
  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are a personal AI assistant. Generate a concise morning briefing for the user based on this data. Use markdown. Be actionable and brief (max 200 words). Highlight urgent items. Suggest top 3 things to focus on today.\n\n${context}`,
    }],
  });

  const briefing = response.content[0].type === 'text' ? response.content[0].text : 'Could not generate briefing.';

  return Response.json({
    briefing,
    stats: {
      activeTasks: todos.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      whiteboardItems: whiteboard.length,
      staleItems: staleItems.length,
    },
  });
}
