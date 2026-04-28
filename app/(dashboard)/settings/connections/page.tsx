'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Calendar, Mail, Music, Github, ExternalLink, Trash2, Plus, RefreshCw, CheckCircle, XCircle, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface CalendarAccount {
  id: string;
  label: string;
  alias: string;
  email: string;
  color: string;
  provider: string;
  is_default: boolean;
  scopes?: string[];
}

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function hasScope(acc: CalendarAccount, scope: string): boolean {
  return Array.isArray(acc.scopes) && acc.scopes.includes(scope);
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
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [aliasValue, setAliasValue] = useState('');

  useEffect(() => { loadStatus(); }, []);

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

  const removeAccount = async (id: string) => {
    if (!confirm('Remove this account? This will disconnect calendar and email.')) return;
    await fetch('/api/calendar/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadStatus();
  };

  const setDefault = async (id: string) => {
    await fetch('/api/calendar/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_default: true }),
    });
    loadStatus();
  };

  const saveAlias = async (id: string) => {
    await fetch('/api/calendar/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, alias: aliasValue }),
    });
    toast.success('Alias updated');
    setEditingAlias(null);
    loadStatus();
  };

  const startEditAlias = (acc: CalendarAccount) => {
    setEditingAlias(acc.id);
    setAliasValue(acc.alias || '');
  };

  // Filter Microsoft accounts (for calendar + email)
  const microsoftAccounts = (status?.calendar ?? []).filter(a => a.provider !== 'google');
  const googleAccounts = (status?.calendar ?? []).filter(a => a.provider === 'google');

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

  const AccountRow = ({ acc, showEmailBadge = false }: { acc: CalendarAccount; showEmailBadge?: boolean }) => (
    <div key={acc.id} className="bg-background rounded-lg px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-foreground text-sm font-medium">{acc.label}</p>
              {acc.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">Default</span>}
              {showEmailBadge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Calendar + Email</span>}
            </div>
            <p className="text-muted-foreground text-xs">{acc.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!acc.is_default && (
            <button onClick={() => setDefault(acc.id)} className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 border border-border rounded transition-colors">Set default</button>
          )}
          <button onClick={() => removeAccount(acc.id)} className="text-muted-foreground hover:text-red-400 p-1 transition-colors"><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Alias row */}
      <div className="flex items-center gap-2 mt-2 ml-6">
        <span className="text-muted-foreground/60 text-[11px]">Display name:</span>
        {editingAlias === acc.id ? (
          <div className="flex items-center gap-1">
            <input
              value={aliasValue}
              onChange={(e) => setAliasValue(e.target.value)}
              placeholder="e.g. Lew Personal, Lew Work"
              className="bg-secondary text-foreground border border-border rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-48"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') saveAlias(acc.id); if (e.key === 'Escape') setEditingAlias(null); }}
            />
            <button onClick={() => saveAlias(acc.id)} className="text-green-400 hover:text-green-300 p-0.5"><Check size={12} /></button>
            <button onClick={() => setEditingAlias(null)} className="text-muted-foreground hover:text-foreground p-0.5"><X size={12} /></button>
          </div>
        ) : (
          <button onClick={() => startEditAlias(acc)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group">
            <span>{acc.alias || acc.label}</span>
            <Pencil size={10} className="opacity-0 group-hover:opacity-100" />
          </button>
        )}
      </div>
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
          {/* ── Microsoft Accounts (Calendar + Email) ── */}
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-1">
                  <Calendar size={18} className="text-blue-400" />
                  <Mail size={18} className="text-blue-400 ml-1" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold text-sm">Microsoft Accounts</h3>
                  <p className="text-muted-foreground text-xs">Calendar + Email (Outlook / Microsoft 365)</p>
                </div>
              </div>
              <StatusBadge connected={microsoftAccounts.length > 0} />
            </div>
            <div className="p-5 space-y-4">
              {/* Existing accounts */}
              {microsoftAccounts.length > 0 && (
                <div className="space-y-2">
                  {microsoftAccounts.map((acc) => (
                    <AccountRow key={acc.id} acc={acc} showEmailBadge />
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
                <p className="text-muted-foreground/60 text-[11px]">Each account provides both calendar and email access. You can add multiple accounts and set display names.</p>
              </div>
            </div>
          </section>

          {/* ── Google (Calendar + Gmail) ── */}
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail size={20} className="text-red-400" />
                <div>
                  <h3 className="text-foreground font-semibold text-sm">Google Account</h3>
                  <p className="text-muted-foreground text-xs">Gmail + Google Calendar</p>
                </div>
              </div>
              <StatusBadge connected={googleAccounts.length > 0} />
            </div>
            <div className="p-5 space-y-3">
              {googleAccounts.map((acc) => {
                const hasGmail = hasScope(acc, GMAIL_READONLY_SCOPE);
                const hasCalendar = hasScope(acc, CALENDAR_READONLY_SCOPE);
                return (
                  <div key={acc.id} className="bg-background rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
                        <div className="min-w-0">
                          <p className="text-foreground text-sm font-medium truncate">{acc.label}</p>
                          <p className="text-muted-foreground text-xs truncate">{acc.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeAccount(acc.id)}
                        className="text-muted-foreground hover:text-red-400 p-1 transition-colors shrink-0"
                        title="Disconnect"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {hasCalendar && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-300 border border-blue-500/30">
                          <Calendar size={10} /> Calendar
                        </span>
                      )}
                      {hasGmail ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                          <Mail size={10} /> Gmail
                        </span>
                      ) : (
                        <a
                          href={`/api/auth/google?scope_set=gmail&login_hint=${encodeURIComponent(acc.email)}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border hover:text-emerald-300 hover:border-emerald-500/30 transition-colors"
                        >
                          <Plus size={10} /> Add Gmail
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                <a
                  href="/api/auth/google?scope_set=all"
                  className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 w-fit"
                >
                  <Plus size={14} />
                  {googleAccounts.length === 0 ? 'Connect Google Account' : 'Add another Google Account'}
                </a>
                <a
                  href="/api/auth/google?scope_set=calendar"
                  className="text-foreground px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-surface-2 transition-colors flex items-center gap-2 w-fit"
                >
                  <Plus size={14} />
                  Calendar only
                </a>
              </div>
              <p className="text-muted-foreground/60 text-[11px]">
                Google will warn that this app isn&apos;t verified — that&apos;s expected for a personal-use OAuth client. Click <span className="text-foreground/80">Advanced → Continue</span>.
              </p>
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
                  {status?.spotify ? 'Your Spotify account is connected.' : 'Connect your Spotify account to control music.'}
                </p>
                <a
                  href="/api/auth/spotify"
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shrink-0 transition-colors',
                    status?.spotify
                      ? 'border border-border text-foreground hover:border-white/15'
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
                  <p className="text-muted-foreground/60 text-xs mt-1">Token managed in Vault</p>
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
