import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const userId = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code || !userId) {
    return NextResponse.redirect(`${APP_URL}/settings/connections?error=google_auth_failed`);
  }

  const redirectUri = `${APP_URL}/api/auth/google/callback`;

  // Exchange code for tokens
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

  // Get user's Google email
  let email = 'Google Calendar';
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      email = userData.email || 'Google Calendar';
    }
  } catch { /* skip */ }

  // Remove existing Google account for this user (if re-connecting)
  await supabaseAdmin
    .from('calendar_accounts')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'google');

  // Insert new Google account
  const { error: insertErr } = await supabaseAdmin.from('calendar_accounts').insert({
    user_id: userId,
    provider: 'google',
    label: 'Google',
    email,
    color: '#4285F4',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
    is_default: false,
  });

  if (insertErr) {
    return NextResponse.redirect(`${APP_URL}/settings/connections?error=google_save_failed&details=${encodeURIComponent(insertErr.message.slice(0, 100))}`);
  }

  return NextResponse.redirect(`${APP_URL}/settings/connections?success=google`);
}
