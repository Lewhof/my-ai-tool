'use client';

import { useState, useEffect } from 'react';
import { Music, ExternalLink, Pause, Play } from 'lucide-react';

interface NowPlaying {
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  isPlaying: boolean;
  progress: number;
  duration: number;
  url: string;
}

interface RecentTrack {
  name: string;
  artist: string;
  playedAt: string;
  albumArt: string;
  url: string;
}

interface TopArtist {
  name: string;
  image: string;
  genres: string[];
}

interface SpotifyData {
  connected: boolean;
  nowPlaying: NowPlaying | null;
  recentTracks: RecentTrack[];
  topArtists: TopArtist[];
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SpotifyWidget() {
  const [data, setData] = useState<SpotifyData | null>(null);
  const [tab, setTab] = useState<'playing' | 'recent' | 'top'>('playing');

  useEffect(() => {
    fetch('/api/spotify').then((r) => r.json()).then(setData).catch(() => setData({ connected: false, nowPlaying: null, recentTracks: [], topArtists: [] }));
    // Poll every 30s for now playing
    const interval = setInterval(() => {
      fetch('/api/spotify').then((r) => r.json()).then(setData).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 h-full">
        <p className="text-gray-500 text-sm">Loading Spotify...</p>
      </div>
    );
  }

  if (!data.connected) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-full flex flex-col">
        <div className="widget-handle px-5 py-3 border-b border-gray-700 cursor-move flex items-center gap-2">
          <Music size={16} className="text-green-500" />
          <h3 className="text-white font-semibold text-sm">Spotify</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-5 gap-3">
          <Music size={32} className="text-gray-600" />
          <p className="text-gray-500 text-sm text-center">Connect Spotify to see what you&apos;re listening to</p>
          <a
            href="/api/auth/spotify"
            className="bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <Music size={14} />
            Connect Spotify
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-full flex flex-col">
      <div className="widget-handle px-5 py-3 border-b border-gray-700 cursor-move flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music size={16} className="text-green-500" />
          <h3 className="text-white font-semibold text-sm">Spotify</h3>
        </div>
        <div className="flex gap-1">
          {(['playing', 'recent', 'top'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs px-2 py-1 rounded transition-colors ${tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {t === 'playing' ? 'Now' : t === 'recent' ? 'Recent' : 'Top'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Now Playing */}
        {tab === 'playing' && (
          data.nowPlaying ? (
            <div className="p-4">
              <div className="flex gap-4">
                {data.nowPlaying.albumArt && (
                  <img src={data.nowPlaying.albumArt} alt={data.nowPlaying.album} className="w-20 h-20 rounded-lg shadow-lg shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <a href={data.nowPlaying.url} target="_blank" className="text-white font-semibold text-sm hover:underline truncate block">
                    {data.nowPlaying.name}
                  </a>
                  <p className="text-gray-400 text-xs mt-0.5 truncate">{data.nowPlaying.artist}</p>
                  <p className="text-gray-500 text-xs truncate">{data.nowPlaying.album}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {data.nowPlaying.isPlaying ? (
                      <Pause size={12} className="text-green-400" />
                    ) : (
                      <Play size={12} className="text-gray-400" />
                    )}
                    <span className="text-gray-500 text-xs">
                      {data.nowPlaying.isPlaying ? 'Playing' : 'Paused'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-3">
                <div className="w-full bg-gray-900 rounded-full h-1.5">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${(data.nowPlaying.progress / data.nowPlaying.duration) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600 text-xs">{formatTime(data.nowPlaying.progress)}</span>
                  <span className="text-gray-600 text-xs">{formatTime(data.nowPlaying.duration)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-5 gap-2">
              <Music size={24} className="text-gray-600" />
              <p className="text-gray-500 text-sm">Nothing playing right now</p>
            </div>
          )
        )}

        {/* Recent Tracks */}
        {tab === 'recent' && (
          <div className="divide-y divide-gray-700">
            {data.recentTracks.length === 0 ? (
              <p className="text-gray-500 text-sm p-5 text-center">No recent tracks</p>
            ) : (
              data.recentTracks.map((track, i) => (
                <a key={i} href={track.url} target="_blank" className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700/30 transition-colors">
                  {track.albumArt && (
                    <img src={track.albumArt} alt="" className="w-10 h-10 rounded shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{track.name}</p>
                    <p className="text-gray-500 text-xs truncate">{track.artist}</p>
                  </div>
                  <span className="text-gray-600 text-xs shrink-0">{timeAgo(track.playedAt)}</span>
                </a>
              ))
            )}
          </div>
        )}

        {/* Top Artists */}
        {tab === 'top' && (
          <div className="divide-y divide-gray-700">
            {data.topArtists.length === 0 ? (
              <p className="text-gray-500 text-sm p-5 text-center">No data yet</p>
            ) : (
              data.topArtists.map((artist, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  {artist.image && (
                    <img src={artist.image} alt={artist.name} className="w-10 h-10 rounded-full shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{artist.name}</p>
                    <p className="text-gray-500 text-xs truncate">{artist.genres.join(', ')}</p>
                  </div>
                  <span className="text-gray-600 text-xs ml-auto">#{i + 1}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
