import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET — handle Google OAuth callback
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const userId = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code || !userId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za'}/settings/connections?error=google_auth_failed`);
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za'}/api/auth/google/callback`;

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
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za'}/settings/connections?error=google_token_failed`);
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

  // Store as calendar account
  await supabaseAdmin.from('calendar_accounts').upsert(
    {
      user_id: userId,
      provider: 'google',
      label: 'Google',
      email,
      color: '#4285F4',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
      is_default: false,
    },
    { onConflict: 'user_id,provider,email' }
  );

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za'}/settings/connections?success=google`);
}
