import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;

export async function getMicrosoftToken(userId: string): Promise<string | null> {
  const { data: accounts } = await supabaseAdmin
    .from('calendar_accounts')
    .select('id, access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('is_default', true)
    .limit(1);

  const account = accounts?.[0];
  if (!account) return null;

  // Token still valid
  if (account.expires_at && Date.now() < account.expires_at - 60000) {
    return account.access_token;
  }

  // Need refresh
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

  await supabaseAdmin
    .from('calendar_accounts')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || account.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    })
    .eq('id', account.id);

  return tokens.access_token;
}
