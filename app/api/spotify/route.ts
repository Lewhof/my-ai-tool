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

  const tokens = data.spotify_tokens as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  if (Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) return null;

  const refreshRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!refreshRes.ok) return null;

  const newTokens = await refreshRes.json();

  await supabaseAdmin
    .from('user_settings')
    .update({
      spotify_tokens: {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || tokens.refresh_token,
        expires_at: Date.now() + newTokens.expires_in * 1000,
      },
    })
    .eq('user_id', userId);

  return newTokens.access_token;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const token = await getValidToken(userId);
  if (!token) return Response.json({ connected: false });

  // Get currently playing
  const nowRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${token}` },
  });

  let nowPlaying = null;
  if (nowRes.ok && nowRes.status !== 204) {
    const data = await nowRes.json();
    if (data?.item) {
      nowPlaying = {
        name: data.item.name,
        artist: data.item.artists?.map((a: { name: string }) => a.name).join(', '),
        album: data.item.album?.name,
        albumArt: data.item.album?.images?.[0]?.url,
        isPlaying: data.is_playing,
        progress: data.progress_ms,
        duration: data.item.duration_ms,
        url: data.item.external_urls?.spotify,
      };
    }
  }

  // Get recently played
  const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=5', {
    headers: { Authorization: `Bearer ${token}` },
  });

  let recentTracks: Array<{ name: string; artist: string; playedAt: string; albumArt: string; url: string }> = [];
  if (recentRes.ok) {
    const data = await recentRes.json();
    recentTracks = (data.items ?? []).map((item: Record<string, unknown>) => {
      const track = item.track as Record<string, unknown>;
      return {
        name: track.name,
        artist: (track.artists as Array<{ name: string }>)?.map((a) => a.name).join(', '),
        playedAt: item.played_at,
        albumArt: ((track.album as Record<string, unknown>)?.images as Array<{ url: string }> | undefined)?.[0]?.url ?? null,
        url: (track.external_urls as Record<string, string>)?.spotify,
      };
    });
  }

  // Get top artists
  const topRes = await fetch('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term', {
    headers: { Authorization: `Bearer ${token}` },
  });

  let topArtists: Array<{ name: string; image: string; genres: string[] }> = [];
  if (topRes.ok) {
    const data = await topRes.json();
    topArtists = (data.items ?? []).map((a: Record<string, unknown>) => ({
      name: a.name,
      image: (a.images as Array<{ url: string }>)?.[0]?.url ?? null,
      genres: ((a.genres as string[]) ?? []).slice(0, 2),
    }));
  }

  return Response.json({ connected: true, nowPlaying, recentTracks, topArtists });
}
