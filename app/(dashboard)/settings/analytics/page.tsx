'use client';

import { useEffect, useState, useCallback } from 'react';
import { Globe, Plus, ExternalLink, Trash2, RefreshCw, BarChart3, TrendingUp, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

type Site = {
  id: string;
  label: string;
  url: string;
  provider: string;
  provider_site_id: string | null;
  api_key_vault_ref: string | null;
  is_active: boolean;
};

type SiteStats = {
  provider: string;
  status: 'connected' | 'error' | 'placeholder' | 'not_configured';
  message?: string;
  visitors?: { today: number; last_7d: number; last_30d: number };
  pageviews?: { today: number; last_7d: number; last_30d: number };
  top_pages?: Array<{ path: string; visitors: number }>;
  top_referrers?: Array<{ source: string; visitors: number }>;
  bounce_rate?: number;
  live_url?: string;
};

const PROVIDERS = [
  { id: 'vercel', label: 'Vercel Analytics' },
  { id: 'plausible', label: 'Plausible' },
  { id: 'ga4', label: 'Google Analytics 4' },
  { id: 'umami', label: 'Umami' },
  { id: 'manual', label: 'Manual / None' },
];

export default function AnalyticsSettingsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [stats, setStats] = useState<Record<string, SiteStats>>({});
  const [newSite, setNewSite] = useState({ label: '', url: '', provider: 'vercel', provider_site_id: '' });

  const loadSites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/sites');
      const data = await res.json();
      setSites(data.sites || []);
      // Load stats for each
      for (const s of (data.sites || []) as Site[]) {
        fetch(`/api/analytics/stats?siteId=${s.id}`)
          .then((r) => r.json())
          .then((d) => setStats((prev) => ({ ...prev, [s.id]: d.stats })))
          .catch(() => {});
      }
    } catch {
      toast.error('Failed to load sites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSites(); }, [loadSites]);

  const addSite = async () => {
    if (!newSite.label || !newSite.url) {
      toast.error('Label and URL required');
      return;
    }
    const res = await fetch('/api/analytics/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSite),
    });
    if (res.ok) {
      toast.success('Site added');
      setShowAdd(false);
      setNewSite({ label: '', url: '', provider: 'vercel', provider_site_id: '' });
      loadSites();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed');
    }
  };

  const removeSite = async (id: string) => {
    if (!confirm('Remove this site?')) return;
    const res = await fetch('/api/analytics/sites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      toast.success('Site removed');
      loadSites();
    }
  };

  const seedDefault = async () => {
    // Seed with lewhofmeyr.co.za as Vercel Analytics.
    // Server will fall back to VERCEL_PROJECT_ID env var when provider_site_id is blank.
    const res = await fetch('/api/analytics/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'Lewhof Main',
        url: 'https://lewhofmeyr.co.za',
        provider: 'vercel',
        provider_site_id: '',
      }),
    });
    if (res.ok) {
      toast.success('Added Lewhof Main');
      loadSites();
    }
  };

  // Aggregate totals
  const totals = Object.values(stats).reduce(
    (acc, s) => ({
      today: acc.today + (s?.visitors?.today ?? 0),
      d7: acc.d7 + (s?.visitors?.last_7d ?? 0),
      d30: acc.d30 + (s?.visitors?.last_30d ?? 0),
    }),
    { today: 0, d7: 0, d30: 0 }
  );

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      connected: 'bg-green-500/20 text-green-400',
      error: 'bg-red-500/20 text-red-400',
      placeholder: 'bg-yellow-500/20 text-yellow-400',
      not_configured: 'bg-muted text-muted-foreground',
    };
    return map[status] || map.not_configured;
  };

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 size={22} /> Website Analytics
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Track visitors across all your sites. Supports Vercel Analytics, Plausible, GA4 and Umami.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadSites} className="text-muted-foreground hover:text-foreground text-xs px-3 py-1.5 border border-border rounded-lg flex items-center gap-2 transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={() => setShowAdd((v) => !v)} className="bg-primary text-foreground px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2">
            <Plus size={12} /> Add site
          </button>
        </div>
      </div>

      {/* Add site form */}
      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h3 className="text-foreground font-semibold text-sm">Add a site</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground text-[11px] block mb-1">Label</label>
              <input
                value={newSite.label}
                onChange={(e) => setNewSite({ ...newSite, label: e.target.value })}
                placeholder="e.g. Lewhof Main"
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-[11px] block mb-1">URL</label>
              <input
                value={newSite.url}
                onChange={(e) => setNewSite({ ...newSite, url: e.target.value })}
                placeholder="https://example.com"
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-[11px] block mb-1">Provider</label>
              <select
                value={newSite.provider}
                onChange={(e) => setNewSite({ ...newSite, provider: e.target.value })}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground"
              >
                {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-muted-foreground text-[11px] block mb-1">
                {newSite.provider === 'vercel' ? 'Vercel Project ID' : newSite.provider === 'plausible' ? 'Domain' : 'Provider Site ID'}
              </label>
              <input
                value={newSite.provider_site_id}
                onChange={(e) => setNewSite({ ...newSite, provider_site_id: e.target.value })}
                placeholder={newSite.provider === 'vercel' ? 'prj_xxx' : newSite.provider === 'plausible' ? 'example.com' : ''}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addSite} className="bg-primary text-foreground px-4 py-2 rounded text-sm font-medium">Add</button>
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground px-4 py-2 text-sm">Cancel</button>
          </div>
          {newSite.provider === 'plausible' && (
            <p className="text-muted-foreground/70 text-[11px] bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
              <AlertCircle size={12} className="inline mr-1" />
              After creating, store your Plausible API key in Vault and set <code className="bg-secondary px-1 rounded">api_key_vault_ref</code> via the database to link it.
            </p>
          )}
        </div>
      )}

      {/* Aggregate totals */}
      {sites.length > 0 && (
        <div>
          <h3 className="text-foreground font-semibold mb-3 flex items-center gap-2">
            <TrendingUp size={16} /> Combined visitors
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-muted-foreground text-xs mb-1">Today</p>
              <p className="text-foreground text-2xl font-bold">{totals.today.toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-muted-foreground text-xs mb-1">Last 7 days</p>
              <p className="text-foreground text-2xl font-bold">{totals.d7.toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-muted-foreground text-xs mb-1">Last 30 days</p>
              <p className="text-foreground text-2xl font-bold">{totals.d30.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sites */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading sites...</p>
      ) : sites.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center space-y-4">
          <Globe size={36} className="mx-auto text-muted-foreground/40" />
          <div>
            <p className="text-foreground font-semibold">No sites connected yet</p>
            <p className="text-muted-foreground text-sm mt-1">Add your first site to start tracking visitors.</p>
          </div>
          <div className="flex justify-center gap-2 pt-2">
            <button onClick={seedDefault} className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Plus size={14} /> Quick-add lewhofmeyr.co.za
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sites.map((site) => {
            const s = stats[site.id];
            return (
              <div key={site.id} className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe size={16} className="text-muted-foreground" />
                    <div>
                      <h4 className="text-foreground font-semibold text-sm">{site.label}</h4>
                      <p className="text-muted-foreground text-xs">{site.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {s && (
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${statusBadge(s.status)}`}>
                        {s.status}
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground uppercase">{site.provider}</span>
                    {s?.live_url && (
                      <a href={s.live_url} target="_blank" className="text-muted-foreground hover:text-primary">
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button onClick={() => removeSite(site.id)} className="text-muted-foreground hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="p-5">
                  {!s ? (
                    <p className="text-muted-foreground text-sm">Loading stats...</p>
                  ) : s.status === 'placeholder' || s.status === 'not_configured' ? (
                    <div className="text-center py-6">
                      <AlertCircle size={24} className="mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-muted-foreground text-sm">{s.message || 'No live data available'}</p>
                      {s.live_url && (
                        <a href={s.live_url} target="_blank" className="mt-3 inline-flex items-center gap-2 text-primary text-xs hover:underline">
                          Open {s.provider} dashboard <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  ) : s.status === 'error' ? (
                    <div className="text-center py-6">
                      <AlertCircle size={24} className="mx-auto text-red-400/60 mb-2" />
                      <p className="text-red-400 text-sm">{s.message || 'Error fetching stats'}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Visitor metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <p className="text-muted-foreground text-xs mb-1">Visitors today</p>
                          <p className="text-foreground text-xl font-bold">{(s.visitors?.today ?? 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs mb-1">Last 7 days</p>
                          <p className="text-foreground text-xl font-bold">{(s.visitors?.last_7d ?? 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs mb-1">Last 30 days</p>
                          <p className="text-foreground text-xl font-bold">{(s.visitors?.last_30d ?? 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs mb-1">Bounce rate</p>
                          <p className="text-foreground text-xl font-bold">{s.bounce_rate ? `${s.bounce_rate}%` : '—'}</p>
                        </div>
                      </div>

                      {/* Top pages + referrers */}
                      {(s.top_pages || s.top_referrers) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-border">
                          {s.top_pages && s.top_pages.length > 0 && (
                            <div>
                              <p className="text-muted-foreground text-xs font-semibold uppercase mb-2">Top pages</p>
                              <div className="space-y-1">
                                {s.top_pages.slice(0, 5).map((p, i) => (
                                  <div key={i} className="flex justify-between text-xs">
                                    <span className="text-foreground truncate">{p.path}</span>
                                    <span className="text-muted-foreground ml-2">{p.visitors}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {s.top_referrers && s.top_referrers.length > 0 && (
                            <div>
                              <p className="text-muted-foreground text-xs font-semibold uppercase mb-2">Top referrers</p>
                              <div className="space-y-1">
                                {s.top_referrers.slice(0, 5).map((r, i) => (
                                  <div key={i} className="flex justify-between text-xs">
                                    <span className="text-foreground truncate">{r.source}</span>
                                    <span className="text-muted-foreground ml-2">{r.visitors}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
