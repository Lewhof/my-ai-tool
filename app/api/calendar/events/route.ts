import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;

async function getValidToken(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('microsoft_tokens')
    .eq('user_id', userId)
    .single();

  if (!data?.microsoft_tokens) return null;

  const tokens = data.microsoft_tokens as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  if (Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) return null;

  const refreshRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
      scope: 'openid profile User.Read Calendars.ReadWrite offline_access',
    }),
  });

  if (!refreshRes.ok) return null;

  const newTokens = await refreshRes.json();

  await supabaseAdmin
    .from('user_settings')
    .update({
      microsoft_tokens: {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || tokens.refresh_token,
        expires_at: Date.now() + newTokens.expires_in * 1000,
      },
    })
    .eq('user_id', userId);

  return newTokens.access_token;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const token = await getValidToken(userId);
  if (!token) return Response.json({ error: 'Not connected to Microsoft' }, { status: 400 });

  const { subject, date, startTime, endTime, location } = await req.json();
  if (!subject || !date) return Response.json({ error: 'Subject and date required' }, { status: 400 });

  const startDateTime = `${date}T${startTime || '09:00'}:00`;
  const endDateTime = `${date}T${endTime || '10:00'}:00`;

  const event = {
    subject,
    start: { dateTime: startDateTime, timeZone: 'Africa/Johannesburg' },
    end: { dateTime: endDateTime, timeZone: 'Africa/Johannesburg' },
    ...(location ? { location: { displayName: location } } : {}),
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: 'Failed to create event', details: err }, { status: 500 });
  }

  const created = await res.json();
  return Response.json({ id: created.id, subject: created.subject });
}
