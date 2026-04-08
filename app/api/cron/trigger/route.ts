import { auth } from '@clerk/nextjs/server';

// Lightweight trigger — calls the main cron endpoint internally
// Used by /dev, /ship, /bug commands and approval flow for instant execution
export async function POST() {
  // Accept both authenticated users and cron calls
  let authorized = false;
  try {
    const { userId } = await auth();
    if (userId) authorized = true;
  } catch { /* not authenticated via Clerk */ }

  if (!authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Call the main cron endpoint with proper auth
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za';
  const cronSecret = process.env.CRON_SECRET;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  try {
    const res = await fetch(`${baseUrl}/api/cron`, {
      headers: {
        ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
        ...(!cronSecret && apiKey ? { 'x-api-key': apiKey } : {}),
      },
    });
    const data = await res.json();
    return Response.json({ triggered: true, ...data });
  } catch (err) {
    return Response.json({ triggered: false, error: err instanceof Error ? err.message : 'Failed' });
  }
}
