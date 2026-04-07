import { auth } from '@clerk/nextjs/server';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const REDIRECT_URI = 'https://lewhofmeyr.co.za/api/auth/spotify/callback';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-recently-played user-top-read user-library-read playlist-read-private playlist-read-collaborative';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', userId);

  return Response.redirect(authUrl.toString());
}
