import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;
const REDIRECT_URI = 'https://lewhofmeyr.co.za/api/auth/microsoft/callback';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');

  if (!code || !state) {
    return Response.redirect('https://lewhofmeyr.co.za/calendar?error=auth_failed');
  }

  const [userId, label] = state.split('|');
  if (!userId) return Response.redirect('https://lewhofmeyr.co.za/calendar?error=auth_failed');

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
      scope: 'openid profile User.Read Calendars.ReadWrite Mail.Read Mail.ReadWrite offline_access',
    }),
  });

  if (!tokenRes.ok) {
    return Response.redirect('https://lewhofmeyr.co.za/calendar?error=token_failed');
  }

  const tokens = await tokenRes.json();

  // Get user profile to get email
  let email = '';
  try {
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      email = profile.mail || profile.userPrincipalName || '';
    }
  } catch { /* skip */ }

  // Check if this email account already exists
  const { data: existing } = await supabaseAdmin
    .from('calendar_accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('email', email)
    .single();

  if (existing) {
    // Update existing account tokens
    await supabaseAdmin
      .from('calendar_accounts')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + tokens.expires_in * 1000,
      })
      .eq('id', existing.id);
  } else {
    // Check if this is the first account (make it default)
    const { data: accounts } = await supabaseAdmin
      .from('calendar_accounts')
      .select('id')
      .eq('user_id', userId);

    const isFirst = !accounts || accounts.length === 0;

    // Insert new account
    await supabaseAdmin
      .from('calendar_accounts')
      .insert({
        user_id: userId,
        provider: 'microsoft',
        label: label || email.split('@')[0] || 'Microsoft',
        email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + tokens.expires_in * 1000,
        is_default: isFirst,
      });
  }

  // Also keep legacy microsoft_tokens for backward compatibility
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

  return Response.redirect('https://lewhofmeyr.co.za/calendar?connected=microsoft');
}
