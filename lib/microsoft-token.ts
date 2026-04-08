import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;

/**
 * Get a valid Microsoft Graph access token for a user.
 * @param userId - Clerk user ID
 * @param accountId - Optional specific account ID. If omitted, uses the default account.
 */
export async function getMicrosoftToken(userId: string, accountId?: string): Promise<string | null> {
  let query = supabaseAdmin
    .from('calendar_accounts')
    .select('id, access_token, refresh_token, expires_at, provider')
    .eq('user_id', userId);

  if (accountId) {
    query = query.eq('id', accountId);
  } else {
    query = query.eq('is_default', true);
  }

  const { data: accounts } = await query.limit(1);

  const account = accounts?.[0];
  if (!account) return null;

  // Token still valid (60s buffer)
  if (account.expires_at && Date.now() < account.expires_at - 60000) {
    return account.access_token;
  }

  // Need refresh
  if (!account.refresh_token) return null;

  // Use correct client credentials based on provider
  const isWork = account.provider === 'microsoft-work';
  const clientId = isWork ? (process.env.MICROSOFT_WORK_CLIENT_ID || CLIENT_ID) : CLIENT_ID;
  const clientSecret = isWork ? (process.env.MICROSOFT_WORK_CLIENT_SECRET || CLIENT_SECRET) : CLIENT_SECRET;

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
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
