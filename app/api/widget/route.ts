import { supabaseAdmin } from '@/lib/supabase-server';

// Lightweight widget data endpoint for home screen widgets
// Authenticated via API key header (for native app use)
export async function GET(req: Request) {
  // Accept either Clerk auth or API key for native widgets
  const apiKey = req.headers.get('x-api-key');

  let userId: string | null = null;

  if (apiKey) {
    // Look up user by stored API key
    const { data } = await supabaseAdmin
      .from('user_settings')
      .select('user_id')
      .eq('widget_api_key', apiKey)
      .limit(1)
      .single();
    userId = data?.user_id || null;
  }

  if (!userId) {
    // Try Clerk auth as fallback
    try {
      const { auth } = await import('@clerk/nextjs/server');
      const { userId: clerkId } = await auth();
      userId = clerkId;
    } catch { /* skip */ }
  }

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Fetch all data in parallel — optimized for speed
  const [briefingRes, todosRes, weatherRes] = await Promise.all([
    // Cached briefing
    supabaseAdmin
      .from('briefings')
      .select('content')
      .eq('user_id', userId)
      .eq('date', today)
      .limit(1)
      .single(),

    // Top pending task
    supabaseAdmin
      .from('todos')
      .select('title, priority, due_date')
      .eq('user_id', userId)
      .neq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(3),

    // Weather
    fetch('https://api.open-meteo.com/v1/forecast?latitude=-26.2041&longitude=28.0473&current=temperature_2m,weather_code')
      .then(r => r.ok ? r.json() : null)
      .catch(() => null),
  ]);

  const briefing = briefingRes.data?.content
    ? briefingRes.data.content.replace(/[#*`]/g, '').slice(0, 200)
    : 'No briefing yet today.';

  const topTasks = (todosRes.data ?? []).map(t => ({
    title: t.title,
    priority: t.priority,
    due: t.due_date,
  }));

  const weather = weatherRes?.current
    ? { temp: weatherRes.current.temperature_2m, code: weatherRes.current.weather_code }
    : null;

  return Response.json({
    date: today,
    briefing,
    tasks: topTasks,
    weather,
    updated: now.toISOString(),
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300', // 5 min cache
    },
  });
}
