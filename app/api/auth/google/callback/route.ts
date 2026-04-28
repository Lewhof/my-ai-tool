import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za';

const GMAIL_PREFIX = 'https://www.googleapis.com/auth/gmail';
const CALENDAR_PREFIX = 'https://www.googleapis.com/auth/calendar';

const REQUIRED_SCOPES: Record<string, string[]> = {
  calendar: ['https://www.googleapis.com/auth/calendar.readonly'],
  gmail: ['https://www.googleapis.com/auth/gmail.readonly'],
  all: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state') || '';
  const error = searchParams.get('error');

  // State format: `${userId}|${scopeSet}` (legacy: just `${userId}`).
  const [stateUserId, scopeSet = 'calendar'] = stateRaw.split('|');

  if (error || !code || !stateUserId) {
    return NextResponse.redirect(`${APP_URL}/settings/connections?error=google_auth_failed`);
  }

  // CSRF gate: the callback runs with the user's session cookie. The userId
  // we write tokens for must match the currently-authenticated user, NOT
  // whatever the URL claims. Without this, an attacker could redirect a
  // victim to a callback URL with the attacker's `code` + the victim's
  // userId in state, hijacking the victim's connected account.
  const { userId: sessionUserId } = await auth();
  if (!sessionUserId || sessionUserId !== stateUserId) {
    return NextResponse.redirect(`${APP_URL}/settings/connections?error=google_state_mismatch`);
  }
  const userId = sessionUserId;

  const redirectUri = `${APP_URL}/api/auth/google/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return NextResponse.redirect(`${APP_URL}/settings/connections?error=google_token_failed&details=${encodeURIComponent(errText.slice(0, 100))}`);
  }

  const tokens = await tokenRes.json();

  // Parse the granted scopes (space-separated string in `tokens.scope`).
  const grantedScopes: string[] = typeof tokens.scope === 'string'
    ? tokens.scope.split(' ').filter(Boolean)
    : [];

  // Granular-consent gate: confirm the user actually granted what we asked
  // for. With granular permissions, the consent screen lets users uncheck
  // individual scopes — without this gate, we'd silently store a Calendar-
  // only row and the UI would say "Gmail connected".
  const required = REQUIRED_SCOPES[scopeSet] ?? [];
  const missing = required.filter(s => !grantedScopes.includes(s));
  if (missing.length > 0) {
    return NextResponse.redirect(`${APP_URL}/settings/connections?error=google_scope_denied&scope_set=${encodeURIComponent(scopeSet)}`);
  }

  // Get the user's Google email so we can dedupe by (user_id, provider, email)
  // and let users connect multiple Google accounts (personal + work).
  let email = 'Google Account';
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      email = userData.email || email;
    }
  } catch { /* skip */ }

  // Re-grant flow: if a row already exists for this user+provider+email,
  // update tokens + replace the scopes IN THE REQUESTED FAMILY (calendar
  // or gmail) with what was just granted. This makes revocation observable
  // — if the user revokes Gmail at myaccount.google.com and reconnects with
  // scope_set=gmail, the previously-stored gmail.readonly is replaced (or
  // dropped) rather than ignored.
  const { data: existing } = await supabaseAdmin
    .from('calendar_accounts')
    .select('id, scopes')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('email', email)
    .maybeSingle();

  const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

  if (existing) {
    const prevScopes = (existing.scopes as string[] | null) ?? [];
    const merged = mergeScopes(prevScopes, grantedScopes, scopeSet);
    const { error: updateErr } = await supabaseAdmin
      .from('calendar_accounts')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || undefined,  // Supabase JS omits undefined → keeps existing
        expires_at: expiresAt,
        scopes: merged,
      })
      .eq('id', existing.id);
    if (updateErr) {
      return NextResponse.redirect(`${APP_URL}/settings/connections?error=google_save_failed&details=${encodeURIComponent(updateErr.message.slice(0, 100))}`);
    }
  } else {
    const { error: insertErr } = await supabaseAdmin.from('calendar_accounts').insert({
      user_id: userId,
      provider: 'google',
      label: 'Google',
      email,
      color: '#4285F4',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: expiresAt,
      scopes: grantedScopes,
      is_default: false,
    });
    if (insertErr) {
      return NextResponse.redirect(`${APP_URL}/settings/connections?error=google_save_failed&details=${encodeURIComponent(insertErr.message.slice(0, 100))}`);
    }
  }

  const success = scopeSet === 'gmail' ? 'google_gmail' : scopeSet === 'all' ? 'google_all' : 'google';
  return NextResponse.redirect(`${APP_URL}/settings/connections?success=${success}`);
}

/**
 * Merge previously-stored scopes with newly-granted scopes for the requested
 * scope set. The "non-requested" family is preserved; the "requested" family
 * is replaced with what was actually granted this time.
 *
 * Example: user had [calendar.readonly, gmail.readonly], reconnects with
 * scope_set=gmail and Google returns only [gmail.readonly]. Previous calendar
 * scope is preserved; gmail family is replaced with the new grant.
 *
 * If scope_set='all', everything is replaced with the new grant — that's the
 * authoritative truth.
 */
function mergeScopes(previous: string[], granted: string[], scopeSet: string): string[] {
  if (scopeSet === 'all') return [...new Set(granted)];

  const isRequestedFamily = (scope: string): boolean => {
    if (scopeSet === 'gmail') return scope.startsWith(GMAIL_PREFIX);
    if (scopeSet === 'calendar') return scope.startsWith(CALENDAR_PREFIX);
    return false;
  };

  const preserved = previous.filter(s => !isRequestedFamily(s));
  return [...new Set([...preserved, ...granted])];
}
