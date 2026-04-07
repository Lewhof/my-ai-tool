import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

async function getValidToken(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('spotify_tokens')
    .eq('user_id', userId)
    .single();

  if (!data?.spotify_tokens) return null;
  const tokens = data.spotify_tokens as { access_token: string; refresh_token: string; expires_at: number };

  if (Date.now() < tokens.expires_at - 60000) return tokens.access_token;
  if (!tokens.refresh_token) return null;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
  });
  if (!res.ok) return null;
  const newTokens = await res.json();

  await supabaseAdmin.from('user_settings').update({
    spotify_tokens: {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      expires_at: Date.now() + newTokens.expires_in * 1000,
    },
  }).eq('user_id', userId);

  return newTokens.access_token;
}

// POST — playback actions
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const token = await getValidToken(userId);
  if (!token) return Response.json({ error: 'Not connected' }, { status: 400 });

  const { action, uri, device_id, position_ms, volume_percent } = await req.json();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = 'https://api.spotify.com/v1/me/player';

  let res: Response;

  switch (action) {
    case 'play':
      res = await fetch(`${base}/play${device_id ? `?device_id=${device_id}` : ''}`, {
        method: 'PUT',
        headers,
        body: uri ? JSON.stringify({ uris: [uri] }) : '{}',
      });
      break;
    case 'pause':
      res = await fetch(`${base}/pause`, { method: 'PUT', headers });
      break;
    case 'next':
      res = await fetch(`${base}/next`, { method: 'POST', headers });
      break;
    case 'previous':
      res = await fetch(`${base}/previous`, { method: 'POST', headers });
      break;
    case 'seek':
      res = await fetch(`${base}/seek?position_ms=${position_ms ?? 0}`, { method: 'PUT', headers });
      break;
    case 'volume':
      res = await fetch(`${base}/volume?volume_percent=${volume_percent ?? 50}`, { method: 'PUT', headers });
      break;
    case 'shuffle':
      res = await fetch(`${base}/shuffle?state=true`, { method: 'PUT', headers });
      break;
    case 'unshuffle':
      res = await fetch(`${base}/shuffle?state=false`, { method: 'PUT', headers });
      break;
    case 'repeat':
      res = await fetch(`${base}/repeat?state=track`, { method: 'PUT', headers });
      break;
    case 'repeat_off':
      res = await fetch(`${base}/repeat?state=off`, { method: 'PUT', headers });
      break;
    case 'queue':
      res = await fetch(`${base}/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST', headers });
      break;
    case 'transfer':
      res = await fetch(base, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ device_ids: [device_id], play: true }),
      });
      break;
    default:
      return Response.json({ error: 'Unknown action' }, { status: 400 });
  }

  if (res.status === 204 || res.ok) return Response.json({ ok: true });
  const err = await res.text().catch(() => 'Unknown error');
  return Response.json({ error: err }, { status: res.status });
}

// GET — get queue, devices, playlists
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const token = await getValidToken(userId);
  if (!token) return Response.json({ error: 'Not connected' }, { status: 400 });

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'queue';
  const headers = { Authorization: `Bearer ${token}` };

  switch (type) {
    case 'queue': {
      const res = await fetch('https://api.spotify.com/v1/me/player/queue', { headers });
      if (!res.ok) return Response.json({ queue: [] });
      const data = await res.json();
      const queue = (data.queue ?? []).slice(0, 10).map((t: Record<string, unknown>) => ({
        name: t.name,
        artist: (t.artists as Array<{ name: string }>)?.map((a) => a.name).join(', '),
        uri: t.uri,
        albumArt: ((t.album as Record<string, unknown>)?.images as Array<{ url: string }> | undefined)?.[0]?.url ?? null,
      }));
      return Response.json({ queue });
    }
    case 'devices': {
      const res = await fetch('https://api.spotify.com/v1/me/player/devices', { headers });
      if (!res.ok) return Response.json({ devices: [] });
      const data = await res.json();
      return Response.json({ devices: data.devices ?? [] });
    }
    case 'playlists': {
      const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=20', { headers });
      if (!res.ok) return Response.json({ playlists: [] });
      const data = await res.json();
      const playlists = (data.items ?? []).map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.name,
        image: ((p.images as Array<{ url: string }>) ?? [])[0]?.url ?? null,
        tracks: (p.tracks as Record<string, number>)?.total ?? 0,
        uri: p.uri,
      }));
      return Response.json({ playlists });
    }
    case 'top_tracks': {
      const res = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=10&time_range=short_term', { headers });
      if (!res.ok) return Response.json({ tracks: [] });
      const data = await res.json();
      const tracks = (data.items ?? []).map((t: Record<string, unknown>) => ({
        name: t.name,
        artist: (t.artists as Array<{ name: string }>)?.map((a) => a.name).join(', '),
        uri: t.uri,
        albumArt: ((t.album as Record<string, unknown>)?.images as Array<{ url: string }> | undefined)?.[0]?.url ?? null,
      }));
      return Response.json({ tracks });
    }
    case 'search': {
      const q = url.searchParams.get('q');
      if (!q) return Response.json({ results: [] });
      const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`, { headers });
      if (!res.ok) return Response.json({ results: [] });
      const data = await res.json();
      const results = (data.tracks?.items ?? []).map((t: Record<string, unknown>) => ({
        name: t.name,
        artist: (t.artists as Array<{ name: string }>)?.map((a) => a.name).join(', '),
        uri: t.uri,
        albumArt: ((t.album as Record<string, unknown>)?.images as Array<{ url: string }> | undefined)?.[0]?.url ?? null,
      }));
      return Response.json({ results });
    }
    default:
      return Response.json({ error: 'Unknown type' }, { status: 400 });
  }
}
