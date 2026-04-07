import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;

async function getToken(userId: string): Promise<string | null> {
  const { data: accounts } = await supabaseAdmin
    .from('calendar_accounts')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('is_default', true)
    .limit(1);

  const account = accounts?.[0];
  if (!account) return null;

  if (account.expires_at && Date.now() < account.expires_at - 60000) return account.access_token;
  if (!account.refresh_token) return null;

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: account.refresh_token, grant_type: 'refresh_token',
      scope: 'openid profile User.Read Mail.Read offline_access',
    }),
  });
  if (!res.ok) return null;
  const tokens = await res.json();

  await supabaseAdmin.from('calendar_accounts').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || account.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  }).eq('user_id', userId).eq('is_default', true);

  return tokens.access_token;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  const token = await getToken(userId);
  if (!token) return Response.json({ error: 'Not connected' }, { status: 400 });

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${id}?$select=id,subject,from,toRecipients,receivedDateTime,body,importance,hasAttachments`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return Response.json({ error: 'Failed to fetch email' }, { status: res.status });

  const email = await res.json();
  return Response.json({
    id: email.id,
    subject: email.subject,
    from: {
      name: email.from?.emailAddress?.name || '',
      email: email.from?.emailAddress?.address || '',
    },
    to: (email.toRecipients ?? []).map((r: Record<string, Record<string, string>>) => ({
      name: r.emailAddress?.name || '',
      email: r.emailAddress?.address || '',
    })),
    date: email.receivedDateTime,
    body: email.body?.content || '',
    bodyType: email.body?.contentType || 'text',
    importance: email.importance,
    hasAttachments: email.hasAttachments,
  });
}
