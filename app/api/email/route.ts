import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;

async function getValidToken(userId: string): Promise<{ token: string; accountLabel: string } | null> {
  const { data: accounts } = await supabaseAdmin
    .from('calendar_accounts')
    .select('access_token, refresh_token, expires_at, label')
    .eq('user_id', userId)
    .eq('is_default', true)
    .limit(1);

  const account = accounts?.[0];
  if (!account) return null;

  if (account.expires_at && Date.now() < account.expires_at - 60000) {
    return { token: account.access_token, accountLabel: account.label };
  }

  if (!account.refresh_token) return null;

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
      scope: 'openid profile User.Read Calendars.ReadWrite Mail.Read Mail.ReadWrite offline_access',
    }),
  });

  if (!res.ok) return null;
  const tokens = await res.json();

  await supabaseAdmin.from('calendar_accounts').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || account.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  }).eq('user_id', userId).eq('is_default', true);

  return { token: tokens.access_token, accountLabel: account.label };
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const folder = url.searchParams.get('folder') || 'inbox';
  const limit = parseInt(url.searchParams.get('limit') || '20');

  const auth_result = await getValidToken(userId);
  if (!auth_result) return Response.json({ connected: false, emails: [] });

  const { token, accountLabel } = auth_result;

  const folderMap: Record<string, string> = {
    inbox: 'inbox',
    sent: 'sentitems',
    drafts: 'drafts',
    archive: 'archive',
  };

  const graphFolder = folderMap[folder] || 'inbox';

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders/${graphFolder}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,bodyPreview,importance,hasAttachments`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      return Response.json({ connected: true, emails: [], error: `Graph API error ${res.status}` });
    }

    const data = await res.json();
    const emails = (data.value ?? []).map((e: Record<string, unknown>) => ({
      id: e.id,
      subject: e.subject || '(no subject)',
      from: {
        name: (e.from as Record<string, Record<string, string>>)?.emailAddress?.name || '',
        email: (e.from as Record<string, Record<string, string>>)?.emailAddress?.address || '',
      },
      date: e.receivedDateTime,
      isRead: e.isRead,
      preview: e.bodyPreview,
      importance: e.importance,
      hasAttachments: e.hasAttachments,
    }));

    return Response.json({ connected: true, account: accountLabel, emails });
  } catch {
    return Response.json({ connected: true, emails: [], error: 'Failed to fetch emails' });
  }
}
