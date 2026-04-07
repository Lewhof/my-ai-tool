import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { subscription, settings } = await req.json();

  if (subscription) {
    // Store push subscription
    await supabaseAdmin.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' }
    );
  }

  if (settings) {
    // Store notification preferences
    await supabaseAdmin.from('user_settings').upsert(
      {
        user_id: userId,
        notification_settings: settings,
      },
      { onConflict: 'user_id' }
    );
  }

  return Response.json({ ok: true });
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('notification_settings')
    .eq('user_id', userId)
    .single();

  return Response.json({
    settings: data?.notification_settings ?? {
      briefing: true,
      taskOverdue: true,
      calendarReminder: true,
    },
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
  });
}
