import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const REDIRECT_URI = 'https://lewhofmeyr.co.za/api/auth/spotify/callback';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const userId = req.nextUrl.searchParams.get('state');

  if (!code || !userId) {
    return Response.redirect('https://lewhofmeyr.co.za/social?error=spotify_auth_failed');
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    return Response.redirect('https://lewhofmeyr.co.za/social?error=spotify_token_failed');
  }

  const tokens = await tokenRes.json();

  await supabaseAdmin
    .from('user_settings')
    .update({
      spotify_tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + tokens.expires_in * 1000,
      },
    })
    .eq('user_id', userId);

  return Response.redirect('https://lewhofmeyr.co.za/social?connected=spotify');
}
