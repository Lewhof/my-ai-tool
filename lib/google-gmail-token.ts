import { supabaseAdmin } from '@/lib/supabase-server';
import { getGoogleToken } from '@/lib/google-token';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/**
 * Get a valid Google access token for an account that has been granted the
 * gmail.readonly scope. Returns null if no row exists, or if the row exists
 * but doesn't have Gmail scope (i.e. it's a Calendar-only Google account).
 *
 * Mirrors the shape of getMicrosoftToken() / getGoogleToken() so call sites
 * stay symmetric.
 */
export async function getGmailToken(userId: string, accountId?: string): Promise<string | null> {
  let query = supabaseAdmin
    .from('calendar_accounts')
    .select('id, scopes')
    .eq('user_id', userId)
    .eq('provider', 'google');

  if (accountId) query = query.eq('id', accountId);

  const { data: accounts } = await query.limit(1);
  const account = accounts?.[0];
  if (!account) return null;

  const scopes = (account.scopes as string[] | null) ?? [];
  if (!scopes.includes(GMAIL_READONLY_SCOPE)) return null;

  // Delegate refresh + caching to the existing Google token helper.
  return getGoogleToken(userId, account.id);
}

export const GMAIL_SCOPES = {
  readonly: GMAIL_READONLY_SCOPE,
} as const;
