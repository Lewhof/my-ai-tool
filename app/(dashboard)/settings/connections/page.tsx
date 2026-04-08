'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Calendar, Music, Github, ExternalLink, Trash2, Plus, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

interface CalendarAccount {
  id: string;
  label: string;
  email: string;
  color: string;
  provider: string;
  is_default: boolean;
}

interface ConnectionStatus {
  spotify: boolean;
  calendar: CalendarAccount[];
  github: { connected: boolean; repo?: string };
}

export default function ConnectionsPage() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [calLabel, setCalLabel] = useState('');

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    const [spotifyRes, calRes, creditsRes] = await Promise.all([
      fetch('/api/spotify').then((r) => r.json()).catch(() => ({ connected: false })),
      fetch('/api/calendar/accounts').then((r) => r.json()).catch(() => ({ accounts: [] })),
      fetch('/api/credits').then((r) => r.json()).catch(() => ({})),
    ]);

    setStatus({
      spotify: spotifyRes.connected ?? false,
      calendar: calRes.accounts ?? [],
      github: {
        connected: creditsRes.github?.status === 'connected',
        repo: creditsRes.github?.repo,
      },
    });
    setLoading(false);
  };

  const removeCalAccount = async (id: string) => {
    if (!confirm('Remove this calendar account?')) return;
    await fetch('/api/calendar/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadStatus();
  };

  const setDefaultCal = async (id: string) => {
    await fetch('/api/calendar/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_default: true }),
    });
    loadStatus();
  };

  const StatusBadge = ({ connected }: { connected: boolean }) => (
    <div className="flex items-center gap-1.5">
      {connected ? (
        <>
          <CheckCircle size={14} className="text-green-400" />
          <span className="text-green-400 text-xs font-medium">Connected</span>
        </>
      ) : (
        <>
          <XCircle size={14} className="text-muted-foreground" />
          <span className="text-muted-foreground text-xs font-medium">Not connected</span>
        </>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Connections</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage connected accounts and services</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading connections...</p>
      ) : (
        <>
          {/* ── Microsoft Calendar ── */}
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={20} className="text-blue-400" />
                <div>
                  <h3 className="text-foreground font-semibold text-sm">Microsoft Calendar</h3>
                  <p className="text-muted-foreground text-xs">Outlook / Microsoft 365 calendars</p>
                </div>
              </div>
              <StatusBadge connected={(status?.calendar?.length ?? 0) > 0} />
            </div>
            <div className="p-5 space-y-4">
              {/* Existing accounts */}
              {(status?.calendar ?? []).length > 0 && (
                <div className="space-y-2">
                  {status!.calendar.map((acc) => (
                    <div key={acc.id} className="flex items-center justify-between bg-background rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color }} />
                        <div>
                          <p className="text-foreground text-sm font-medium">{acc.label}</p>
                          <p className="text-muted-foreground text-xs">{acc.email}</p>
                        </div>
                        {acc.is_default && <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">Default</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {!acc.is_default && (
                          <button onClick={() => setDefaultCal(acc.id)} className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 border border-border rounded transition-colors">Set default</button>
                        )}
                        <button onClick={() => removeCalAccount(acc.id)} className="text-muted-foreground hover:text-red-400 p-1 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add account */}
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <input
                    value={calLabel}
                    onChange={(e) => setCalLabel(e.target.value)}
                    placeholder="Account label (e.g. Work, Personal, Claudine)"
                    className="flex-1 bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-w-[180px]"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <a
                    href={`/api/auth/microsoft?label=${encodeURIComponent(calLabel || 'Personal')}`}
                    className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shrink-0"
                  >
                    <Plus size={14} />
                    Add Personal Account
                  </a>
                  <a
                    href={`/api/auth/microsoft-work?label=${encodeURIComponent(calLabel || 'Work')}`}
                    className="text-foreground px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-surface-2 transition-colors flex items-center gap-2 shrink-0"
                  >
                    <Plus size={14} />
                    Add Work / 365 Account
                  </a>
                </div>
                <p className="text-muted-foreground/60 text-[11px]">Enter a label first, then choose account type. You can add multiple accounts.</p>
              </div>
            </div>
          </section>

          {/* ── Google Calendar ── */}
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={20} className="text-red-400" />
                <div>
                  <h3 className="text-foreground font-semibold text-sm">Google Calendar</h3>
                  <p className="text-muted-foreground text-xs">Gmail / Google Workspace calendars</p>
                </div>
              </div>
              <StatusBadge connected={(status?.calendar ?? []).some(a => a.provider === 'google')} />
            </div>
            <div className="p-5">
              {(status?.calendar ?? []).filter(a => a.provider === 'google').map((acc) => (
                <div key={acc.id} className="flex items-center justify-between bg-background rounded-lg px-4 py-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color }} />
                    <div>
                      <p className="text-foreground text-sm font-medium">{acc.label}</p>
                      <p className="text-muted-foreground text-xs">{acc.email}</p>
                    </div>
                  </div>
                  <button onClick={() => removeCalAccount(acc.id)} className="text-muted-foreground hover:text-red-400 p-1 transition-colors"><Trash2 size={14} /></button>
                </div>
              ))}
              <a
                href="/api/auth/google"
                className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors flex items-center gap-2 w-fit"
              >
                <Plus size={14} />
                Connect Google Calendar
              </a>
            </div>
          </section>

          {/* ── Spotify ── */}
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Music size={20} className="text-green-400" />
                <div>
                  <h3 className="text-foreground font-semibold text-sm">Spotify</h3>
                  <p className="text-muted-foreground text-xs">Music playback, playlists, and listening history</p>
                </div>
              </div>
              <StatusBadge connected={status?.spotify ?? false} />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  {status?.spotify ? 'Your Spotify account is connected. Playback controls require Spotify Premium.' : 'Connect your Spotify account to control music and see listening history.'}
                </p>
                <a
                  href="/api/auth/spotify"
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shrink-0 transition-colors',
                    status?.spotify
                      ? 'border border-border text-foreground hover:text-foreground hover:border-white/15'
                      : 'bg-green-600 text-foreground hover:bg-green-700'
                  )}
                >
                  {status?.spotify ? <RefreshCw size={14} /> : <ExternalLink size={14} />}
                  {status?.spotify ? 'Re-connect' : 'Connect Spotify'}
                </a>
              </div>
            </div>
          </section>

          {/* ── GitHub ── */}
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Github size={20} className="text-foreground" />
                <div>
                  <h3 className="text-foreground font-semibold text-sm">GitHub</h3>
                  <p className="text-muted-foreground text-xs">Repository access for the Telegram agent</p>
                </div>
              </div>
              <StatusBadge connected={status?.github?.connected ?? false} />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm">
                    {status?.github?.connected ? `Connected to ${status.github.repo}` : 'GitHub is configured via environment variables.'}
                  </p>
                  <p className="text-muted-foreground/60 text-xs mt-1">Token managed in Vault → API Key → GITHUB_TOKEN</p>
                </div>
                <a href="/vault" className="text-muted-foreground hover:text-foreground text-xs px-3 py-1.5 border border-border rounded-lg transition-colors">Manage in Vault</a>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
