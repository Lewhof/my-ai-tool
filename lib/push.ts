import webpush from 'web-push';
import { supabaseAdmin } from './supabase-server';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:lew@lewhof.co.za',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const { data: subscriptions } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, keys')
    .eq('user_id', userId);

  if (!subscriptions?.length) return;

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload)
      ).catch(async (err) => {
        // Remove invalid subscriptions (410 Gone, 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
        }
      })
    )
  );

  return results;
}
