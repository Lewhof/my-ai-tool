import { auth } from '@clerk/nextjs/server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const REDIRECT_URI = 'https://lewhofmeyr.co.za/api/auth/microsoft/callback';
const SCOPES = 'openid profile User.Read Calendars.Read offline_access';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('state', userId);

  return Response.redirect(authUrl.toString());
}
