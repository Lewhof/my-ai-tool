import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const REDIRECT_URI = 'https://lewhofmeyr.co.za/api/auth/microsoft/callback';
const SCOPES = 'openid profile User.Read Calendars.ReadWrite Mail.Read Mail.ReadWrite offline_access';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Pass label via state (format: userId|label)
  const label = req.nextUrl.searchParams.get('label') || 'Microsoft';
  const state = `${userId}|${label}`;

  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  return Response.redirect(authUrl.toString());
}
