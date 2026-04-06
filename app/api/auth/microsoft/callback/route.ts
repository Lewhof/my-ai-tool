import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;
const REDIRECT_URI = 'https://lewhofmeyr.co.za/api/auth/microsoft/callback';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const userId = req.nextUrl.searchParams.get('state');

  if (!code || !userId) {
    return Response.redirect('https://lewhofmeyr.co.za/settings?error=microsoft_auth_failed');
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: 'openid profile User.Read Calendars.ReadWrite offline_access',
    }),
  });

  if (!tokenRes.ok) {
    return Response.redirect('https://lewhofmeyr.co.za/settings?error=token_exchange_failed');
  }

  const tokens = await tokenRes.json();

  // Store tokens in user_settings
  await supabaseAdmin
    .from('user_settings')
    .update({
      microsoft_tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + tokens.expires_in * 1000,
      },
    })
    .eq('user_id', userId);

  return Response.redirect('https://lewhofmeyr.co.za/?connected=microsoft');
}
