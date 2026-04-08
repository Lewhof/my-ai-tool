import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { sendPushToUser } from '@/lib/push';

// Cron: Generate and cache daily briefings for all users
// Schedule: 0 5 * * * (5:00 AM UTC = 7:00 AM SAST)
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Get all users who have activity
  const { data: users } = await supabaseAdmin
    .from('todos')
    .select('user_id')
    .limit(50);

  const uniqueUserIds = [...new Set((users ?? []).map(u => u.user_id))];
  let generated = 0;

  for (const userId of uniqueUserIds) {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      // Check if briefing already exists for today
      const { data: existing } = await supabaseAdmin
        .from('briefings')
        .select('id')
        .eq('user_id', userId)
        .eq('date', today)
        .limit(1);

      if (existing?.length) continue;

      // Gather user data
      const [todosRes, whiteboardRes, notepadRes] = await Promise.all([
        supabaseAdmin.from('todos').select('title, status, priority, due_date').eq('user_id', userId).neq('status', 'done').limit(10),
        supabaseAdmin.from('whiteboard').select('title, status, priority').eq('user_id', userId).neq('status', 'done').order('priority', { ascending: true }).limit(5),
        supabaseAdmin.from('notes').select('content').eq('user_id', userId).limit(1).single(),
      ]);

      const todos = todosRes.data ?? [];
      const overdue = todos.filter(t => t.due_date && t.due_date < today);

      // Get weather
      let weather = '';
      try {
        const wRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-26.2041&longitude=28.0473&current=temperature_2m,weather_code');
        if (wRes.ok) {
          const wData = await wRes.json();
          weather = `${wData.current.temperature_2m}°C`;
        }
      } catch { /* skip */ }

      const context = `Today: ${now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
Weather: ${weather || 'Unknown'}
Tasks (${todos.length} active): ${todos.slice(0, 5).map(t => `${t.title} [${t.priority}]`).join(', ')}
Overdue: ${overdue.length > 0 ? overdue.map(t => t.title).join(', ') : 'None'}
Whiteboard: ${(whiteboardRes.data ?? []).slice(0, 3).map(w => `${w.title} [${w.status}]`).join(', ')}
User context: ${notepadRes.data?.content?.slice(0, 300) || 'Not set'}`;

      const response = await anthropic.messages.create({
        model: MODELS.fast,
        max_tokens: 400,
        messages: [{ role: 'user', content: `You are a personal AI assistant. Generate a sharp morning briefing (max 150 words, markdown). Highlight urgent items. Suggest top 3 focus areas.\n\n${context}` }],
      });

      const briefing = response.content[0].type === 'text' ? response.content[0].text : '';

      // Cache the briefing
      await supabaseAdmin.from('briefings').upsert({
        user_id: userId,
        date: today,
        content: briefing,
        created_at: now.toISOString(),
      });

      // Send push notification
      const firstLine = briefing.replace(/[#*`\n]/g, ' ').trim().split('.')[0];
      await sendPushToUser(userId, {
        title: 'Morning Briefing',
        body: firstLine.slice(0, 120),
        tag: 'briefing',
        url: '/',
      });

      generated++;
    } catch { /* skip user on error */ }
  }

  return Response.json({ generated, users: uniqueUserIds.length });
}
