import { supabaseAdmin } from '@/lib/supabase-server';
import { sendPushToUser } from '@/lib/push';
import { gatherBriefingData, generateBriefing, formatBriefingForTelegram } from '@/lib/briefing';
import { sendTelegramMessage, getTelegramChatId } from '@/lib/telegram';

// Standalone briefing endpoint — can be triggered manually or by separate cron
// The main /api/cron also generates briefings at 4:30 AM UTC
// This endpoint serves as a fallback and manual trigger
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const validCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const validApiKey = req.headers.get('x-api-key') === process.env.ANTHROPIC_API_KEY;
  if (!validCron && !validApiKey && authHeader !== `Bearer ${process.env.ANTHROPIC_API_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

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

      // Generate via shared function
      const data = await gatherBriefingData(userId);
      const result = await generateBriefing(userId, data);

      // Push notification
      const firstLine = result.briefing.replace(/[#*`\n]/g, ' ').trim().split('.')[0];
      await sendPushToUser(userId, {
        title: '\u2615 Morning Briefing',
        body: firstLine.slice(0, 120),
        tag: 'briefing',
        url: '/',
      });

      // Telegram delivery
      const chatId = getTelegramChatId();
      if (chatId) {
        const telegramMsg = formatBriefingForTelegram(result);
        await sendTelegramMessage(chatId, telegramMsg);
      }

      generated++;
    } catch { /* skip user on error */ }
  }

  return Response.json({ generated, users: uniqueUserIds.length });
}
