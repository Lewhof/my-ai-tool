import { supabaseAdmin } from '@/lib/supabase-server';
import { getMicrosoftToken } from '@/lib/microsoft-token';
import { getGoogleToken } from '@/lib/google-token';
import { fetchFitnessSessions } from '@/lib/lhfitness-bridge';

// Provider-agnostic calendar event fetcher. Used by the briefing, planner,
// and Cerebro's get_calendar tool — anything that needs "what's on the
// user's calendar" without caring which provider it lives on.

export interface CalendarEvent {
  id: string;
  subject: string;
  start: string;          // ISO datetime
  end: string;            // ISO datetime
  accountId: string;
  accountLabel: string;
  provider: 'microsoft' | 'microsoft-work' | 'google' | 'lhfitness';
}

interface CalendarAccount {
  id: string;
  label: string | null;
  alias: string | null;
  provider: string;
}

/**
 * Fetch calendar events from ALL connected accounts (Microsoft personal,
 * Microsoft work, Google) for a given window. Dedupes by subject+start
 * across accounts (same meeting on personal + work) and sorts ascending.
 */
export async function fetchCalendarEvents(
  userId: string,
  startIso: string,
  endIso: string,
  opts: { perAccountLimit?: number } = {}
): Promise<CalendarEvent[]> {
  const limit = opts.perAccountLimit ?? 100;

  const { data: rawAccounts } = await supabaseAdmin
    .from('calendar_accounts')
    .select('id, label, alias, provider')
    .eq('user_id', userId)
    .in('provider', ['microsoft', 'microsoft-work', 'google']);

  const accounts = (rawAccounts ?? []) as CalendarAccount[];

  const accountFetches = accounts.map(async (acc) => {
    try {
      const label = acc.alias || acc.label || providerLabel(acc.provider);
      if (acc.provider === 'google') {
        return await fetchGoogleEvents(userId, acc.id, label, startIso, endIso, limit);
      }
      return await fetchMicrosoftEvents(userId, acc.id, label, acc.provider, startIso, endIso, limit);
    } catch {
      return [];
    }
  });

  // LH Fitness scheduled sessions are a fourth source. Failure-isolated:
  // if the bridge throws, calendar still renders the other providers.
  const fitnessFetch = fetchFitnessSessions(userId, startIso, endIso).catch(() => [] as CalendarEvent[]);

  const settled = await Promise.all([...accountFetches, fitnessFetch]);

  const flat = settled.flat();
  // Dedupe across accounts: same meeting often lands on both personal +
  // work calendars or on a shared Google + invited Microsoft. We never
  // dedupe LH Fitness sessions against external events — a coincidentally-
  // titled Outlook event must not hide a training session.
  const seen = new Set<string>();
  const deduped = flat.filter(e => {
    if (e.provider === 'lhfitness') return true;
    const key = `${e.subject}|${e.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function providerLabel(provider: string): string {
  if (provider === 'google') return 'Google';
  if (provider === 'microsoft-work') return 'Work';
  return 'Microsoft';
}

async function fetchMicrosoftEvents(
  userId: string,
  accountId: string,
  label: string,
  provider: string,
  startIso: string,
  endIso: string,
  limit: number,
): Promise<CalendarEvent[]> {
  const token = await getMicrosoftToken(userId, accountId);
  if (!token) return [];

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${encodeURIComponent(startIso)}&endDateTime=${encodeURIComponent(endIso)}&$top=${limit}&$select=subject,start,end`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="Africa/Johannesburg"',
      },
    },
  );
  if (!res.ok) return [];

  const data = await res.json();
  type GraphEvent = { id?: string; subject: string; start: { dateTime: string }; end: { dateTime: string } };
  const items = (data.value ?? []) as GraphEvent[];
  return items.map((e, idx) => ({
    id: e.id ?? `${accountId}-${idx}`,
    subject: e.subject ?? '(no title)',
    start: e.start.dateTime,
    end: e.end.dateTime,
    accountId,
    accountLabel: label,
    provider: (provider === 'microsoft-work' ? 'microsoft-work' : 'microsoft') as 'microsoft' | 'microsoft-work',
  }));
}

async function fetchGoogleEvents(
  userId: string,
  accountId: string,
  label: string,
  startIso: string,
  endIso: string,
  limit: number,
): Promise<CalendarEvent[]> {
  const token = await getGoogleToken(userId, accountId);
  if (!token) return [];

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(startIso)}` +
    `&timeMax=${encodeURIComponent(endIso)}` +
    `&maxResults=${limit}` +
    `&singleEvents=true&orderBy=startTime&timeZone=Africa/Johannesburg`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];

  const data = await res.json();
  type GoogleEvent = { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
  const items = (data.items ?? []) as GoogleEvent[];
  return items.map((e) => ({
    id: e.id,
    subject: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    accountId,
    accountLabel: label,
    provider: 'google' as const,
  })).filter(e => e.start);
}
