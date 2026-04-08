import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { getMicrosoftToken } from '@/lib/microsoft-token';

export interface BriefingData {
  weather: string;
  calendarEvents: Array<{ subject: string; start: string; end: string }>;
  todos: Array<{ title: string; priority: string; due_date: string | null; status: string }>;
  overdueTasks: Array<{ title: string; due_date: string }>;
  dueTodayTasks: Array<{ title: string; priority: string }>;
  whiteboardItems: Array<{ title: string; status: string; priority: string; created_at: string }>;
  staleItems: Array<{ title: string }>;
  unreadEmails: number;
  notepadContext: string;
}

export interface BriefingResult {
  briefing: string;
  stats: {
    activeTasks: number;
    overdue: number;
    dueToday: number;
    whiteboardItems: number;
    staleItems: number;
    calendarEvents: number;
    unreadEmails: number;
  };
  data: BriefingData;
}

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle',
  55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Light showers',
  81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm',
};

/**
 * Gather all data needed for the daily briefing.
 * Works in cron context (no Clerk auth — uses userId directly).
 */
export async function gatherBriefingData(userId: string): Promise<BriefingData> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Parallel data fetching
  const [todosRes, whiteboardRes, notepadRes, weatherRes, calendarData, unreadEmails] = await Promise.all([
    supabaseAdmin
      .from('todos')
      .select('title, status, priority, due_date')
      .eq('user_id', userId)
      .neq('status', 'done')
      .order('priority', { ascending: true })
      .limit(15),

    supabaseAdmin
      .from('whiteboard')
      .select('title, status, priority, created_at')
      .eq('user_id', userId)
      .neq('status', 'done')
      .order('priority', { ascending: true })
      .limit(10),

    supabaseAdmin
      .from('notes')
      .select('content')
      .eq('user_id', userId)
      .limit(1)
      .single(),

    fetchWeather(),
    fetchCalendarEvents(userId),
    fetchUnreadEmailCount(userId),
  ]);

  const todos = todosRes.data ?? [];
  const whiteboard = whiteboardRes.data ?? [];
  const overdueTasks = todos.filter(t => t.due_date && t.due_date < today);
  const dueTodayTasks = todos.filter(t => t.due_date === today);
  const staleItems = whiteboard.filter(w => {
    return w.status === 'idea' && (now.getTime() - new Date(w.created_at).getTime()) > 14 * 86400000;
  });

  return {
    weather: weatherRes,
    calendarEvents: calendarData,
    todos,
    overdueTasks,
    dueTodayTasks,
    whiteboardItems: whiteboard,
    staleItems,
    unreadEmails,
    notepadContext: notepadRes.data?.content?.slice(0, 500) || '',
  };
}

/**
 * Generate AI briefing from gathered data.
 */
export async function generateBriefing(userId: string, data: BriefingData): Promise<BriefingResult> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dateStr = now.toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  });

  const context = `
Today: ${dateStr}
Weather: ${data.weather || 'Unknown'}
Unread emails: ${data.unreadEmails}

Calendar (${data.calendarEvents.length} events today):
${data.calendarEvents.length > 0
    ? data.calendarEvents.map(e => {
      const start = new Date(e.start).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
      const end = new Date(e.end).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
      return `- ${start}-${end}: ${e.subject}`;
    }).join('\n')
    : 'No events scheduled'}

Tasks (${data.todos.length} active):
${data.todos.slice(0, 8).map(t => `- [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}`).join('\n') || 'No active tasks'}

Overdue (${data.overdueTasks.length}): ${data.overdueTasks.length > 0 ? data.overdueTasks.map(t => t.title).join(', ') : 'None'}
Due today (${data.dueTodayTasks.length}): ${data.dueTodayTasks.length > 0 ? data.dueTodayTasks.map(t => t.title).join(', ') : 'None'}

Whiteboard (${data.whiteboardItems.length} items):
${data.whiteboardItems.slice(0, 5).map(w => `- [${w.status}] ${w.title}`).join('\n') || 'Empty'}
Stale items (14+ days as Idea): ${data.staleItems.length > 0 ? data.staleItems.map(s => s.title).join(', ') : 'None'}

User context: ${data.notepadContext || 'Not set'}
  `.trim();

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are a personal AI chief of staff. Generate a sharp morning briefing (max 200 words, markdown). Structure:
1. One-line weather + date summary
2. Calendar overview (highlight conflicts or back-to-back meetings)
3. Priority tasks — flag overdue items with warning
4. One actionable AI insight (connect dots between calendar, tasks, and deadlines)
5. Top 3 focus areas for the day

Be direct, concise, and actionable. No fluff.

${context}`,
    }],
  });

  const briefing = response.content[0].type === 'text' ? response.content[0].text : 'Could not generate briefing.';

  // Cache in database
  await supabaseAdmin.from('briefings').upsert({
    user_id: userId,
    date: today,
    content: briefing,
    created_at: now.toISOString(),
  });

  return {
    briefing,
    stats: {
      activeTasks: data.todos.length,
      overdue: data.overdueTasks.length,
      dueToday: data.dueTodayTasks.length,
      whiteboardItems: data.whiteboardItems.length,
      staleItems: data.staleItems.length,
      calendarEvents: data.calendarEvents.length,
      unreadEmails: data.unreadEmails,
    },
    data,
  };
}

/**
 * Sanitize markdown for Telegram V1 Markdown.
 * Telegram only supports: *bold*, _italic_, `code`, [link](url)
 * Strips: # headings, ** double bold, ---, > blockquotes
 */
function sanitizeForTelegram(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // Remove # headings
    .replace(/\*\*/g, '*')              // ** → * (Telegram uses single *)
    .replace(/^---+$/gm, '')            // Remove horizontal rules
    .replace(/^>\s?/gm, '')             // Remove blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Remove links, keep text
    .replace(/\n{3,}/g, '\n\n')         // Collapse multiple blank lines
    .trim();
}

/**
 * Format briefing for Telegram (Markdown V1).
 */
export function formatBriefingForTelegram(result: BriefingResult): string {
  const { stats, data } = result;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Africa/Johannesburg',
  });

  let msg = `*Good morning, Lew.* \u2615\n`;
  msg += `${dateStr}\n\n`;

  // Weather
  if (data.weather) {
    msg += `\u{1F324} *Weather:* ${data.weather}\n\n`;
  }

  // Calendar
  msg += `\u{1F4C5} *Calendar* (${stats.calendarEvents} events):\n`;
  if (data.calendarEvents.length > 0) {
    for (const e of data.calendarEvents.slice(0, 6)) {
      const start = new Date(e.start).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
      msg += `  \u2022 ${start} - ${e.subject}\n`;
    }
  } else {
    msg += `  Clear day - no meetings\n`;
  }
  msg += '\n';

  // Tasks
  msg += `\u{1F4CB} *Tasks* (${stats.activeTasks} active):\n`;
  if (stats.overdue > 0) {
    msg += `  \u26A0\uFE0F Overdue: ${data.overdueTasks.map(t => t.title).join(', ')}\n`;
  }
  if (stats.dueToday > 0) {
    msg += `  \u{1F4CC} Today: ${data.dueTodayTasks.map(t => t.title).join(', ')}\n`;
  }
  if (stats.overdue === 0 && stats.dueToday === 0) {
    msg += `  All clear - no urgent items\n`;
  }
  msg += '\n';

  // Email
  msg += `\u{1F4E7} *Unread Emails:* ${stats.unreadEmails}\n\n`;

  // AI Insight (the generated briefing, sanitized for Telegram)
  const sanitized = sanitizeForTelegram(result.briefing);
  msg += `\u{1F9E0} *AI Insight:*\n${sanitized.slice(0, 800)}`;

  return msg;
}

// ── Helper functions ──

async function fetchWeather(): Promise<string> {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=-26.2041&longitude=28.0473&current=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m'
    );
    if (!res.ok) return '';
    const wData = await res.json();
    const current = wData.current;
    const code = current.weather_code as number;
    const desc = WEATHER_CODES[code] ?? 'Unknown';
    return `${current.temperature_2m}\u00B0C, ${desc} (feels like ${current.apparent_temperature}\u00B0C)`;
  } catch {
    return '';
  }
}

async function fetchCalendarEvents(userId: string): Promise<Array<{ subject: string; start: string; end: string }>> {
  try {
    const token = await getMicrosoftToken(userId);
    if (!token) return [];

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startOfDay.toISOString()}&endDateTime=${endOfDay.toISOString()}&$orderby=start/dateTime&$top=20&$select=subject,start,end`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.value ?? []).map((e: { subject: string; start: { dateTime: string }; end: { dateTime: string } }) => ({
      subject: e.subject,
      start: e.start.dateTime,
      end: e.end.dateTime,
    }));
  } catch {
    return [];
  }
}

async function fetchUnreadEmailCount(userId: string): Promise<number> {
  try {
    const token = await getMicrosoftToken(userId);
    if (!token) return 0;

    const res = await fetch(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead eq false&$count=true&$top=1',
      { headers: { Authorization: `Bearer ${token}`, Prefer: 'odata.maxpagesize=1' } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data['@odata.count'] ?? data.value?.length ?? 0;
  } catch {
    return 0;
  }
}
