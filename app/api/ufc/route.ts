// UFC events from TheSportsDB — free tier, no auth required
// Uses eventsseason.php for the current year, filters to upcoming events

interface SportsDbEvent {
  idEvent: string;
  strEvent: string;
  dateEvent: string;
  strTime: string;
  strVenue: string | null;
  strCity: string | null;
  strCountry: string | null;
  strThumb: string | null;
  strPoster: string | null;
  strStatus: string;
}

interface UfcEvent {
  id: string;
  name: string;
  date: string;
  time: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  thumb: string | null;
  status: string;
  isPast: boolean;
}

// In-memory cache (15 min TTL)
let cache: { events: UfcEvent[]; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;
const UFC_LEAGUE_ID = 4443;
const API_KEY = '3'; // free tier key

async function fetchUfcEvents(): Promise<UfcEvent[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.events;

  const now = new Date();
  const year = now.getFullYear();
  const today = now.toISOString().slice(0, 10);

  // Fetch current year + potentially next year if we're in Dec
  const urls = [`https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsseason.php?id=${UFC_LEAGUE_ID}&s=${year}`];
  if (now.getMonth() >= 10) {
    urls.push(`https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsseason.php?id=${UFC_LEAGUE_ID}&s=${year + 1}`);
  }

  const allEvents: SportsDbEvent[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 900 } });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.events) allEvents.push(...data.events);
    } catch { /* skip */ }
  }

  const events: UfcEvent[] = allEvents
    .map(e => ({
      id: e.idEvent,
      name: e.strEvent,
      date: e.dateEvent,
      time: e.strTime && e.strTime !== '00:00:00' ? e.strTime.slice(0, 5) : null,
      venue: e.strVenue || null,
      city: e.strCity || null,
      country: e.strCountry || null,
      thumb: e.strThumb || e.strPoster || null,
      status: e.strStatus || 'Scheduled',
      isPast: e.dateEvent < today,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  cache = { events, ts: Date.now() };
  return events;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const filter = url.searchParams.get('filter') || 'upcoming'; // 'upcoming' | 'past' | 'all'

  const events = await fetchUfcEvents();
  const today = new Date().toISOString().slice(0, 10);

  let filtered: UfcEvent[];
  if (filter === 'upcoming') {
    filtered = events.filter(e => e.date >= today).slice(0, limit);
  } else if (filter === 'past') {
    filtered = events.filter(e => e.date < today).reverse().slice(0, limit);
  } else {
    filtered = events.slice(0, limit);
  }

  return Response.json({ events: filtered });
}
