import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;

async function refreshToken(accountId: string, refreshTokenStr: string): Promise<string | null> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshTokenStr,
      grant_type: 'refresh_token',
      scope: 'openid profile User.Read Calendars.ReadWrite offline_access',
    }),
  });
  if (!res.ok) return null;
  const tokens = await res.json();

  await supabaseAdmin
    .from('calendar_accounts')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || refreshTokenStr,
      expires_at: Date.now() + tokens.expires_in * 1000,
    })
    .eq('id', accountId);

  return tokens.access_token;
}

async function getValidToken(account: { id: string; access_token: string; refresh_token: string | null; expires_at: number | null }): Promise<string | null> {
  if (account.expires_at && Date.now() < account.expires_at - 60000) {
    return account.access_token;
  }
  if (!account.refresh_token) return null;
  return refreshToken(account.id, account.refresh_token);
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Get all calendar accounts
  const { data: accounts } = await supabaseAdmin
    .from('calendar_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false });

  if (!accounts || accounts.length === 0) {
    return Response.json({ connected: false, accounts: [], events: [] });
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

  const allEvents: Array<{
    id: string;
    subject: string;
    start: string;
    end: string;
    location: string | null;
    isAllDay: boolean;
    showAs: string;
    accountId: string;
    accountLabel: string;
    accountColor: string;
  }> = [];

  const accountSummaries = [];

  for (const account of accounts) {
    const token = await getValidToken(account);
    const summary = {
      id: account.id,
      label: account.label,
      email: account.email,
      color: account.color,
      provider: account.provider,
      is_default: account.is_default,
      connected: !!token,
    };
    accountSummaries.push(summary);

    if (!token) continue;

    try {
      const calRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startOfDay}&endDateTime=${endOfWeek}&$orderby=start/dateTime&$top=50&$select=subject,start,end,location,isAllDay,showAs`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Prefer: 'outlook.timezone="Africa/Johannesburg"',
          },
        }
      );

      if (calRes.ok) {
        const calData = await calRes.json();
        for (const e of calData.value ?? []) {
          // Append +02:00 so frontend Date() parses as SAST, not UTC
          const startDt = (e.start?.dateTime || '').replace(/\.0+$/, '');
          const endDt = (e.end?.dateTime || '').replace(/\.0+$/, '');
          allEvents.push({
            id: e.id,
            subject: e.subject,
            start: startDt.includes('+') || startDt.includes('Z') ? startDt : startDt + '+02:00',
            end: endDt.includes('+') || endDt.includes('Z') ? endDt : endDt + '+02:00',
            location: e.location?.displayName || null,
            isAllDay: e.isAllDay,
            showAs: e.showAs,
            accountId: account.id,
            accountLabel: account.label,
            accountColor: account.color,
          });
        }
      }
    } catch { /* skip failed account */ }
  }

  // Sort all events by start time
  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return Response.json({
    connected: true,
    accounts: accountSummaries,
    events: allEvents,
  });
}
