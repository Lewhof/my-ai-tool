import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { gatherBriefingData, generateBriefing } from '@/lib/briefing';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Check for cached briefing first
  try {
    const { data: cached } = await supabaseAdmin
      .from('briefings')
      .select('content')
      .eq('user_id', userId)
      .eq('date', today)
      .limit(1)
      .single();

    if (cached?.content) {
      // Still need live stats, gather data but skip AI generation
      const data = await gatherBriefingData(userId);
      return Response.json({
        briefing: cached.content,
        cached: true,
        stats: {
          activeTasks: data.todos.length,
          overdue: data.overdueTasks.length,
          dueToday: data.dueTodayTasks.length,
          whiteboardItems: data.whiteboardItems.length,
          staleItems: data.staleItems.length,
          calendarEvents: data.calendarEvents.length,
          unreadEmails: data.unreadEmails,
        },
      }, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } });
    }
  } catch { /* no cache, generate fresh */ }

  // Generate fresh briefing via shared function
  const data = await gatherBriefingData(userId);
  const result = await generateBriefing(userId, data);

  return Response.json({
    briefing: result.briefing,
    stats: result.stats,
  }, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } });
}
