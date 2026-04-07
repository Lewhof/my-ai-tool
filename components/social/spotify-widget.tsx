'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, ListMusic, Search, Smartphone, Plus, ExternalLink,
} from 'lucide-react';

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

interface Track { name: string; artist: string; uri: string; albumArt: string | null }
interface Device { id: string; name: string; type: string; is_active: boolean; volume_percent: number }
interface Playlist { id: string; name: string; image: string | null; tracks: number; uri: string }

type Tab = 'playing' | 'queue' | 'search' | 'playlists' | 'devices' | 'top';

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function SpotifyWidget() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [recentTracks, setRecentTracks] = useState<Array<Track & { playedAt: string }>>([]);
  const [topArtists, setTopArtists] = useState<Array<{ name: string; image: string; genres: string[] }>>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<Tab>('playing');
  const [volume, setVolume] = useState(50);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'track'>('off');

  const fetchNowPlaying = useCallback(async () => {
    try {
      const res = await fetch('/api/spotify');
      const data = await res.json();
      setConnected(data.connected);
      setNowPlaying(data.nowPlaying ?? null);
      setRecentTracks(data.recentTracks ?? []);
      setTopArtists(data.topArtists ?? []);
    } catch { setConnected(false); }
  }, []);

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 15000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  const playerAction = async (action: string, extra: Record<string, unknown> = {}) => {
    await fetch('/api/spotify/player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    setTimeout(fetchNowPlaying, 500);
  };

  const fetchTab = async (t: Tab) => {
    setTab(t);
    if (t === 'queue') {
      const res = await fetch('/api/spotify/player?type=queue');
      const data = await res.json();
      setQueue(data.queue ?? []);
    } else if (t === 'devices') {
      const res = await fetch('/api/spotify/player?type=devices');
      const data = await res.json();
      setDevices(data.devices ?? []);
    } else if (t === 'playlists') {
      const res = await fetch('/api/spotify/player?type=playlists');
      const data = await res.json();
      setPlaylists(data.playlists ?? []);
    } else if (t === 'top') {
      const res = await fetch('/api/spotify/player?type=top_tracks');
      const data = await res.json();
      setTopTracks(data.tracks ?? []);
    }
  };

  const searchSpotify = async () => {
    if (!searchQuery.trim()) return;
    const res = await fetch(`/api/spotify/player?type=search&q=${encodeURIComponent(searchQuery)}`);
    const data = await res.json();
    setSearchResults(data.results ?? []);
  };

  if (connected === null) return <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 h-full"><p className="text-gray-500 text-sm">Loading Spotify...</p></div>;

  if (!connected) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-full flex flex-col">
        <div className="widget-handle px-5 py-3 border-b border-gray-700 cursor-move flex items-center gap-2">
          <Music size={16} className="text-green-500" />
          <h3 className="text-white font-semibold text-sm">Spotify</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-5 gap-3">
          <Music size={32} className="text-gray-600" />
          <p className="text-gray-500 text-sm text-center">Connect Spotify to control your music</p>
          <a href="/api/auth/spotify" className="bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2">
            <Music size={14} />
            Connect Spotify
          </a>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; icon: typeof Music; label: string }> = [
    { id: 'playing', icon: Music, label: 'Now' },
    { id: 'queue', icon: ListMusic, label: 'Queue' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'playlists', icon: ListMusic, label: 'Lists' },
    { id: 'devices', icon: Smartphone, label: 'Devices' },
    { id: 'top', icon: Music, label: 'Top' },
  ];

  // Track list component reused across tabs
  const TrackRow = ({ track, onPlay, onQueue }: { track: Track; onPlay?: () => void; onQueue?: () => void }) => (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700/30 transition-colors group">
      {track.albumArt && <img src={track.albumArt} alt="" className="w-9 h-9 rounded shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm truncate">{track.name}</p>
        <p className="text-gray-500 text-xs truncate">{track.artist}</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onPlay && <button onClick={onPlay} className="text-gray-400 hover:text-green-400 p-1" title="Play"><Play size={14} /></button>}
        {onQueue && <button onClick={onQueue} className="text-gray-400 hover:text-accent-400 p-1" title="Add to queue"><Plus size={14} /></button>}
      </div>
    </div>
  );

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-full flex flex-col">
      {/* Header + tabs */}
      <div className="widget-handle px-4 py-2 border-b border-gray-700 cursor-move">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Music size={16} className="text-green-500" />
            <h3 className="text-white font-semibold text-sm">Spotify</h3>
          </div>
          {nowPlaying?.url && (
            <a href={nowPlaying.url} target="_blank" className="text-gray-500 hover:text-green-400 transition-colors"><ExternalLink size={13} /></a>
          )}
        </div>
        <div className="flex gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => fetchTab(t.id)}
              className={cn('text-xs px-2 py-1 rounded transition-colors', tab === t.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* ── Now Playing ── */}
        {tab === 'playing' && (
          <div className="p-4">
            {nowPlaying ? (
              <>
                <div className="flex gap-4">
                  {nowPlaying.albumArt && <img src={nowPlaying.albumArt} alt={nowPlaying.album} className="w-24 h-24 rounded-lg shadow-lg shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-sm truncate">{nowPlaying.name}</p>
                    <p className="text-gray-400 text-xs mt-0.5 truncate">{nowPlaying.artist}</p>
                    <p className="text-gray-500 text-xs truncate">{nowPlaying.album}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="w-full bg-gray-900 rounded-full h-1.5 cursor-pointer" onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    playerAction('seek', { position_ms: Math.floor(pct * nowPlaying.duration) });
                  }}>
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(nowPlaying.progress / nowPlaying.duration) * 100}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-gray-600 text-xs">{formatTime(nowPlaying.progress)}</span>
                    <span className="text-gray-600 text-xs">{formatTime(nowPlaying.duration)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-3 mt-3">
                  <button onClick={() => { setIsShuffle(!isShuffle); playerAction(isShuffle ? 'unshuffle' : 'shuffle'); }} className={cn('p-1.5 rounded transition-colors', isShuffle ? 'text-green-400' : 'text-gray-500 hover:text-white')} title="Shuffle">
                    <Shuffle size={16} />
                  </button>
                  <button onClick={() => playerAction('previous')} className="text-gray-400 hover:text-white p-1.5 transition-colors" title="Previous">
                    <SkipBack size={18} />
                  </button>
                  <button onClick={() => playerAction(nowPlaying.isPlaying ? 'pause' : 'play')} className="bg-white text-black rounded-full p-2.5 hover:scale-105 transition-transform" title={nowPlaying.isPlaying ? 'Pause' : 'Play'}>
                    {nowPlaying.isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                  </button>
                  <button onClick={() => playerAction('next')} className="text-gray-400 hover:text-white p-1.5 transition-colors" title="Next">
                    <SkipForward size={18} />
                  </button>
                  <button onClick={() => { const next = repeatMode === 'off' ? 'track' : 'off'; setRepeatMode(next); playerAction(next === 'track' ? 'repeat' : 'repeat_off'); }} className={cn('p-1.5 rounded transition-colors', repeatMode === 'track' ? 'text-green-400' : 'text-gray-500 hover:text-white')} title="Repeat">
                    <Repeat size={16} />
                  </button>
                </div>

                {/* Volume */}
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => playerAction('volume', { volume_percent: volume === 0 ? 50 : 0 })} className="text-gray-500 hover:text-white transition-colors">
                    {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => { const v = Number(e.target.value); setVolume(v); playerAction('volume', { volume_percent: v }); }}
                    className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer accent-green-500"
                  />
                  <span className="text-gray-600 text-xs w-7 text-right">{volume}%</span>
                </div>

                {/* Recent */}
                {recentTracks.length > 0 && (
                  <div className="mt-4">
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Recently Played</p>
                    <div className="space-y-0.5">
                      {recentTracks.slice(0, 4).map((t, i) => (
                        <div key={i} className="flex items-center gap-2 py-1">
                          {t.albumArt && <img src={t.albumArt} alt="" className="w-7 h-7 rounded shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-xs truncate">{t.name}</p>
                            <p className="text-gray-500 text-xs truncate">{t.artist}</p>
                          </div>
                          <span className="text-gray-600 text-xs shrink-0">{timeAgo(t.playedAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Music size={24} className="text-gray-600" />
                <p className="text-gray-500 text-sm">Nothing playing</p>
                <p className="text-gray-600 text-xs">Start playing on any device</p>
              </div>
            )}
          </div>
        )}

        {/* ── Queue ── */}
        {tab === 'queue' && (
          <div className="divide-y divide-gray-700/50">
            {queue.length === 0 ? (
              <p className="text-gray-500 text-sm p-5 text-center">Queue is empty</p>
            ) : (
              queue.map((t, i) => <TrackRow key={i} track={t} onPlay={() => playerAction('play', { uri: t.uri })} />)
            )}
          </div>
        )}

        {/* ── Search ── */}
        {tab === 'search' && (
          <div>
            <div className="p-3 border-b border-gray-700">
              <div className="flex gap-2">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchSpotify()}
                  placeholder="Search songs..."
                  className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button onClick={searchSpotify} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700 transition-colors">
                  <Search size={14} />
                </button>
              </div>
            </div>
            <div className="divide-y divide-gray-700/50">
              {searchResults.map((t, i) => (
                <TrackRow key={i} track={t} onPlay={() => playerAction('play', { uri: t.uri })} onQueue={() => playerAction('queue', { uri: t.uri })} />
              ))}
            </div>
          </div>
        )}

        {/* ── Playlists ── */}
        {tab === 'playlists' && (
          <div className="divide-y divide-gray-700/50">
            {playlists.length === 0 ? (
              <p className="text-gray-500 text-sm p-5 text-center">No playlists</p>
            ) : (
              playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => playerAction('play', { uri: p.uri })}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700/30 transition-colors text-left"
                >
                  {p.image && <img src={p.image} alt="" className="w-10 h-10 rounded shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{p.name}</p>
                    <p className="text-gray-500 text-xs">{p.tracks} tracks</p>
                  </div>
                  <Play size={14} className="text-gray-500 shrink-0" />
                </button>
              ))
            )}
          </div>
        )}

        {/* ── Devices ── */}
        {tab === 'devices' && (
          <div className="divide-y divide-gray-700/50">
            {devices.length === 0 ? (
              <p className="text-gray-500 text-sm p-5 text-center">No active devices</p>
            ) : (
              devices.map((d) => (
                <button
                  key={d.id}
                  onClick={() => playerAction('transfer', { device_id: d.id })}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700/30 transition-colors text-left"
                >
                  <Smartphone size={16} className={d.is_active ? 'text-green-400' : 'text-gray-500'} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', d.is_active ? 'text-green-400 font-medium' : 'text-white')}>{d.name}</p>
                    <p className="text-gray-500 text-xs">{d.type} · {d.volume_percent}%</p>
                  </div>
                  {d.is_active && <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />}
                </button>
              ))
            )}
          </div>
        )}

        {/* ── Top Tracks ── */}
        {tab === 'top' && (
          <div className="divide-y divide-gray-700/50">
            {topTracks.length === 0 ? (
              <p className="text-gray-500 text-sm p-5 text-center">No data yet</p>
            ) : (
              topTracks.map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700/30 transition-colors group">
                  <span className="text-gray-600 text-xs w-5 text-right">#{i + 1}</span>
                  {t.albumArt && <img src={t.albumArt} alt="" className="w-9 h-9 rounded shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{t.name}</p>
                    <p className="text-gray-500 text-xs truncate">{t.artist}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => playerAction('play', { uri: t.uri })} className="text-gray-400 hover:text-green-400 p-1"><Play size={14} /></button>
                    <button onClick={() => playerAction('queue', { uri: t.uri })} className="text-gray-400 hover:text-accent-400 p-1"><Plus size={14} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
