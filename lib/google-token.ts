import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

/**
 * Get a valid Google access token for a user's calendar account.
 * Mirrors the shape of getMicrosoftToken() so call sites can branch on
 * the account.provider field without two different APIs.
 */
export async function getGoogleToken(userId: string, accountId?: string): Promise<string | null> {
  let query = supabaseAdmin
    .from('calendar_accounts')
    .select('id, access_token, refresh_token, expires_at, provider')
    .eq('user_id', userId)
    .eq('provider', 'google');

  if (accountId) query = query.eq('id', accountId);

  const { data: accounts } = await query.limit(1);
  const account = accounts?.[0];
  if (!account) return null;

  // Token still valid (60s buffer)
  if (account.expires_at && Date.now() < account.expires_at - 60_000) {
    return account.access_token;
  }
  if (!account.refresh_token) return null;
  if (!CLIENT_ID || !CLIENT_SECRET) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) return null;
  const tokens = await res.json();

  await supabaseAdmin
    .from('calendar_accounts')
    .update({
      access_token: tokens.access_token,
      // Google sometimes rotates the refresh token; keep the existing one if absent.
      refresh_token: tokens.refresh_token || account.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    })
    .eq('id', account.id);

  return tokens.access_token;
}
