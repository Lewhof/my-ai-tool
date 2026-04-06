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

  // Token still valid
  if (Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token;
  }

  // Refresh token
  if (!tokens.refresh_token) return null;

  const refreshRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
      scope: 'openid profile User.Read Calendars.Read offline_access',
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

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const token = await getValidToken(userId);
  if (!token) {
    return Response.json({ connected: false, events: [] });
  }

  // Get today's events
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

  const calRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startOfDay}&endDateTime=${endOfWeek}&$orderby=start/dateTime&$top=20&$select=subject,start,end,location,isAllDay,showAs`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!calRes.ok) {
    return Response.json({ connected: true, events: [], error: 'Failed to fetch calendar' });
  }

  const calData = await calRes.json();

  const events = (calData.value ?? []).map((e: Record<string, unknown>) => ({
    id: e.id,
    subject: e.subject,
    start: (e.start as Record<string, string>)?.dateTime,
    end: (e.end as Record<string, string>)?.dateTime,
    location: (e.location as Record<string, string>)?.displayName || null,
    isAllDay: e.isAllDay,
    showAs: e.showAs,
  }));

  return Response.json({ connected: true, events });
}
