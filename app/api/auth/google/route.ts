import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// GET — redirect user to Google OAuth consent screen
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return Response.json({ error: 'Google OAuth not configured' }, { status: 500 });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za'}/api/auth/google/callback`;

  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state: userId,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
