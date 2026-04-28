import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// GET — redirect user to Google OAuth consent screen.
//
// Query param: scope_set = 'calendar' | 'gmail' | 'all'  (default 'calendar')
//   - 'calendar' (default, used by the existing "Connect Google Calendar" button)
//   - 'gmail'    (used by the "Connect Gmail" button — adds gmail.readonly)
//   - 'all'      (Calendar + Gmail in one consent screen, for new users)
//
// Uses include_granted_scopes=true so a Gmail-add for an existing Calendar
// account merges into a single refresh token — no Calendar re-prompt.

const SCOPE_SETS: Record<string, string[]> = {
  calendar: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
  all: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
};

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return Response.json({ error: 'Google OAuth not configured' }, { status: 500 });

  const url = new URL(req.url);
  const scopeSet = (url.searchParams.get('scope_set') || 'calendar') as keyof typeof SCOPE_SETS;
  const scopes = SCOPE_SETS[scopeSet] ?? SCOPE_SETS.calendar;
  const loginHint = url.searchParams.get('login_hint') || undefined;

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lewhofmeyr.co.za'}/api/auth/google/callback`;

  // Encode the originating scope_set in the state so the callback knows
  // which success route + flash to render. State format: `${userId}|${scopeSet}`.
  const state = `${userId}|${scopeSet}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
