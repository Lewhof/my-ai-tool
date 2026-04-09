'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  DollarSign, Zap, Clock, AlertTriangle, CheckCircle, BarChart3,
  Server, Database, Users, GitBranch, Sparkles, ExternalLink,
  RefreshCw, Trash2, Layers,
} from 'lucide-react';
import { toast } from 'sonner';

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function modelColor(model: string): string {
  if (model.includes('haiku')) return 'bg-green-500';
  if (model.includes('sonnet')) return 'bg-blue-500';
  if (model.includes('opus')) return 'bg-purple-500';
  return 'bg-muted-foreground';
}

function modelColorText(model: string): string {
  if (model.includes('haiku')) return 'text-green-400';
  if (model.includes('sonnet')) return 'text-blue-400';
  if (model.includes('opus')) return 'text-purple-400';
  return 'text-muted-foreground';
}

function tierBadge(tier: 'fast' | 'smart' | 'deep') {
  const map = {
    fast: { label: 'FAST', cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    smart: { label: 'SMART', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    deep: { label: 'DEEP', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  } as const;
  return map[tier];
}

function StatusCard({ name, icon: Icon, status, detail }: { name: string; icon: typeof Zap; status: string; detail: string }) {
  const ok = status === 'connected';
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-400' : status === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`} />
      <Icon size={14} className="text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-foreground text-xs font-medium truncate">{name}</p>
        <p className="text-muted-foreground text-xs truncate">{detail}</p>
      </div>
    </div>
  );
}

const PERIOD_TABS = ['Today', '7 days', '30 days', '90 days'];

type StackRow = {
  task: string;
  model: string;
  tier: 'fast' | 'smart' | 'deep';
  provider: string;
  useCase: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
};

type ProviderStatus = {
  id: string;
  name: string;
  configured: boolean;
  status: 'connected' | 'error' | 'not_configured';
  balance?: string;
  usage?: string;
  plan?: string;
  message?: string;
  link?: string;
};

type CacheStat = {
  scope: string;
  entries: number;
  total_hits: number;
  avg_hits_per_entry: number;
  oldest_entry: string | null;
  newest_entry: string | null;
};

export default function CreditsPage() {
  const [apiData, setApiData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState('30 days');
  const [stack, setStack] = useState<StackRow[] | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStat[] | null>(null);
  const [cachePurging, setCachePurging] = useState(false);

  const loadAll = () => {
    setLoading(true);
    fetch('/api/credits').then((r) => r.json()).then((d) => { setApiData(d); setLoading(false); }).catch(() => setLoading(false));
    fetch('/api/ai-stack/stack').then((r) => r.json()).then((d) => setStack(d.stack)).catch(() => {});
    fetch('/api/ai-stack/providers').then((r) => r.json()).then((d) => setProviders(d.providers)).catch(() => {});
    fetch('/api/admin/cache-stats').then((r) => r.json()).then((d) => setCacheStats(d.stats || [])).catch(() => {});
  };

  useEffect(() => { loadAll(); }, []);

  const purgeCache = async () => {
    setCachePurging(true);
    try {
      const res = await fetch('/api/admin/cache-stats', { method: 'POST' });
      const data = await res.json();
      toast.success(`Purged ${data.purged ?? 0} expired entries`);
      fetch('/api/admin/cache-stats').then((r) => r.json()).then((d) => setCacheStats(d.stats || []));
    } catch {
      toast.error('Purge failed');
    } finally {
      setCachePurging(false);
    }
  };

  // Extract data safely
  const helicone = apiData?.helicone as Record<string, unknown> | undefined;
  const periods = helicone?.periods as Record<string, Record<string, unknown>> | undefined;
  const period = periods?.[activePeriod];
  const vercel = apiData?.vercel as { status: string; plan?: string; totalDeployments?: number; successfulDeployments?: number; failedDeployments?: number; successRate?: number } | undefined;
  const supabase = apiData?.supabase as { status: string; plan?: string; tables?: number; totalRows?: number; tableBreakdown?: Array<{ table: string; rows: number }>; dbSize?: string; dbSizeBytes?: number; dbSizeLimit?: string; storageFiles?: number; storageBytes?: number; storageLimit?: string } | undefined;
  const clerk = apiData?.clerk as { status: string; plan?: string; totalUsers?: number } | undefined;
  const github = apiData?.github as { status: string; repo?: string; size?: number; commits?: number; defaultBranch?: string } | undefined;

  const p = period as {
    totalCost: number;
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    avgLatency: number;
    avgCostPerRequest: number;
    successRate: number;
    errorCount: number;
    models: Record<string, { cost: number; requests: number; inputTokens: number; outputTokens: number; avgLatency: number }>;
  } | undefined;
  const hasPeriodData = p && p.totalRequests > 0;

  // Group stack by tier for the visualizer
  const stackByTier = stack ? {
    fast: stack.filter((s) => s.tier === 'fast'),
    smart: stack.filter((s) => s.tier === 'smart'),
    deep: stack.filter((s) => s.tier === 'deep'),
  } : null;

  // Cache stats totals
  const cacheTotals = (cacheStats ?? []).reduce(
    (acc, s) => ({ entries: acc.entries + s.entries, hits: acc.hits + s.total_hits }),
    { entries: 0, hits: 0 }
  );
  // Rough $ savings: each cache hit ≈ $0.0005 (Haiku classification avg)
  const estSavings = cacheTotals.hits * 0.0005;

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI & Stack</h2>
          <p className="text-muted-foreground text-sm mt-1">Full stack: providers, usage, routing, cache, infrastructure</p>
        </div>
        <button onClick={loadAll} className="text-muted-foreground hover:text-foreground text-xs px-3 py-1.5 border border-border rounded-lg flex items-center gap-2 transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ── Service Status ── */}
      <div>
        <h3 className="text-foreground font-semibold mb-3">Connectors</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatusCard name="Anthropic" icon={Zap} status={loading ? 'loading' : helicone?.status === 'connected' ? 'connected' : 'error'} detail={hasPeriodData ? `${p!.totalRequests} requests` : helicone?.status === 'connected' ? 'No usage yet' : String(helicone?.message || 'Not connected')} />
          <StatusCard name="Vercel" icon={Server} status={loading ? 'loading' : vercel?.status === 'connected' ? 'connected' : 'error'} detail={vercel?.plan as string || 'Checking...'} />
          <StatusCard name="Supabase" icon={Database} status={loading ? 'loading' : supabase?.status === 'connected' ? 'connected' : 'error'} detail={supabase?.tables ? `${supabase.tables} tables, ${supabase.totalRows} rows` : 'Checking...'} />
          <StatusCard name="Clerk" icon={Users} status={loading ? 'loading' : clerk?.status === 'connected' ? 'connected' : 'error'} detail={clerk?.plan as string || 'Checking...'} />
          <StatusCard name="GitHub" icon={GitBranch} status={loading ? 'loading' : github?.status === 'connected' ? 'connected' : 'error'} detail={github?.repo as string || 'Checking...'} />
          {/* Non-Anthropic AI providers */}
          {providers?.map((pr) => (
            <StatusCard
              key={pr.id}
              name={pr.name}
              icon={Sparkles}
              status={pr.status === 'connected' ? 'connected' : pr.status === 'not_configured' ? 'error' : 'error'}
              detail={pr.balance || pr.usage || pr.message || (pr.status === 'not_configured' ? 'Not configured' : 'Error')}
            />
          ))}
        </div>
      </div>

      {/* ── Stack Visualisation ── */}
      <div>
        <h3 className="text-foreground font-semibold mb-1 flex items-center gap-2">
          <Layers size={16} /> Routing Stack
        </h3>
        <p className="text-muted-foreground text-xs mb-3">Hand-coded task → model mapping. No classifier, zero overhead.</p>
        {stackByTier ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['fast', 'smart', 'deep'] as const).map((tier) => {
              const rows = stackByTier[tier];
              const badge = tierBadge(tier);
              const modelName = rows[0]?.model || (tier === 'fast' ? 'claude-haiku-4-5' : tier === 'smart' ? 'claude-sonnet-4-6' : 'claude-opus-4-6');
              const cost = rows[0] ? `$${rows[0].inputCostPer1M}/$${rows[0].outputCostPer1M}` : '—';
              return (
                <div key={tier} className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                      <span className={`text-xs font-mono ${modelColorText(modelName)}`}>{modelName}</span>
                    </div>
                    <span className="text-muted-foreground text-[10px]">{cost}/1M</span>
                  </div>
                  <div className="p-2 space-y-1">
                    {rows.length === 0 ? (
                      <p className="text-muted-foreground/60 text-xs p-2 italic">Reserved — no tasks assigned</p>
                    ) : rows.map((r) => (
                      <div key={r.task} className="px-2 py-1.5 rounded hover:bg-surface-2 group" title={r.useCase}>
                        <p className="text-foreground text-xs font-mono">{r.task}</p>
                        <p className="text-muted-foreground/60 text-[10px] group-hover:text-muted-foreground truncate">{r.useCase}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Loading stack map...</p>
        )}
      </div>

      {/* ── AI Usage ── */}
      <div>
        <h3 className="text-foreground font-semibold mb-3">Usage (Anthropic via Helicone)</h3>
        <div className="flex gap-2 mb-4">
          {PERIOD_TABS.map((tab) => (
            <button key={tab} onClick={() => setActivePeriod(tab)} className={cn('px-4 py-2 rounded-full text-sm font-medium border transition-colors', activePeriod === tab ? 'bg-white text-background border-white' : 'text-muted-foreground border-border hover:border-white/15')}>
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading AI metrics...</p>
        ) : !hasPeriodData ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center space-y-3">
            <Zap size={24} className="mx-auto text-muted-foreground/60 mb-2" />
            <p className="text-muted-foreground text-sm">AI usage data not available via API for this period.</p>
            <p className="text-muted-foreground/60 text-xs">Helicone free tier may not support API queries. View your usage directly:</p>
            <a
              href="https://us.helicone.ai/requests"
              target="_blank"
              className="inline-flex items-center gap-2 bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors"
            >
              Open Helicone Dashboard <ExternalLink size={12} />
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><DollarSign size={14} className="text-primary" /><p className="text-muted-foreground text-xs">Spend</p></div>
                <p className="text-foreground text-2xl font-bold">{formatCost(p!.totalCost)}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><Zap size={14} className="text-yellow-500" /><p className="text-muted-foreground text-xs">Requests</p></div>
                <p className="text-foreground text-2xl font-bold">{(p!.totalRequests).toLocaleString()}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><BarChart3 size={14} className="text-blue-500" /><p className="text-muted-foreground text-xs">Tokens</p></div>
                <p className="text-foreground text-2xl font-bold">{formatTokens(p!.totalTokens)}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><DollarSign size={14} className="text-muted-foreground" /><p className="text-muted-foreground text-xs">Avg/Req</p></div>
                <p className="text-foreground text-2xl font-bold">{formatCost(p!.avgCostPerRequest)}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><Clock size={14} className="text-cyan-500" /><p className="text-muted-foreground text-xs">Latency</p></div>
                <p className="text-foreground text-2xl font-bold">{(p!.avgLatency) < 1000 ? `${p!.avgLatency}ms` : `${((p!.avgLatency) / 1000).toFixed(1)}s`}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">{(p!.errorCount) > 0 ? <AlertTriangle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-green-500" />}<p className="text-muted-foreground text-xs">Success</p></div>
                <p className="text-foreground text-2xl font-bold">{p!.successRate}%</p>
              </div>
            </div>

            {/* Model Table */}
            {p!.models && Object.keys(p!.models).length > 0 && (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-border"><h4 className="text-foreground font-semibold text-sm">Cost by Model</h4></div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-border">
                      {['Model', 'Requests', 'Input', 'Output', 'Latency', 'Cost'].map((h, i) => (
                        <th key={h} className={`text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {Object.entries(p!.models).sort(([, a], [, b]) => b.cost - a.cost).map(([model, s]) => (
                        <tr key={model} className="hover:bg-secondary/30">
                          <td className="px-5 py-3"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${modelColor(model)}`} /><span className={`text-sm font-mono ${modelColorText(model)}`}>{model}</span></div></td>
                          <td className="px-5 py-3 text-right text-foreground text-sm">{s.requests.toLocaleString()}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground text-sm">{formatTokens(s.inputTokens)}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground text-sm">{formatTokens(s.outputTokens)}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground text-sm">{s.avgLatency < 1000 ? `${s.avgLatency}ms` : `${(s.avgLatency / 1000).toFixed(1)}s`}</td>
                          <td className="px-5 py-3 text-right text-foreground text-sm font-medium">{formatCost(s.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Other AI Providers (Non-Anthropic) ── */}
      {providers && providers.length > 0 && (
        <div>
          <h3 className="text-foreground font-semibold mb-3">Other AI Providers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {providers.map((pr) => (
              <div key={pr.id} className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-foreground font-semibold text-sm">{pr.name}</h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${pr.status === 'connected' ? 'bg-green-500/20 text-green-400' : pr.status === 'not_configured' ? 'bg-muted text-muted-foreground' : 'bg-red-500/20 text-red-400'}`}>
                    {pr.status === 'connected' ? 'Connected' : pr.status === 'not_configured' ? 'Not configured' : 'Error'}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {pr.plan && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="text-foreground">{pr.plan}</span>
                    </div>
                  )}
                  {pr.balance && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Balance</span>
                      <span className="text-green-400 font-medium">{pr.balance}</span>
                    </div>
                  )}
                  {pr.usage && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Usage</span>
                      <span className="text-foreground">{pr.usage}</span>
                    </div>
                  )}
                  {pr.message && !pr.balance && !pr.usage && (
                    <p className="text-muted-foreground/70 text-[11px] italic">{pr.message}</p>
                  )}
                </div>
                {pr.link && (
                  <a href={pr.link} target="_blank" className="mt-3 inline-flex items-center gap-1 text-primary text-[11px] hover:underline">
                    Manage <ExternalLink size={10} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Response Cache (Phase 4.2) ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-foreground font-semibold">Response Cache (Tier 1 exact-match)</h3>
          <button onClick={purgeCache} disabled={cachePurging} className="text-muted-foreground hover:text-red-400 text-xs px-3 py-1.5 border border-border rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50">
            <Trash2 size={12} /> {cachePurging ? 'Purging...' : 'Purge expired'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-muted-foreground text-xs mb-1">Cached Entries</p>
            <p className="text-foreground text-2xl font-bold">{cacheTotals.entries.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-muted-foreground text-xs mb-1">Total Hits</p>
            <p className="text-foreground text-2xl font-bold">{cacheTotals.hits.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-muted-foreground text-xs mb-1">Est. Saved</p>
            <p className="text-green-400 text-2xl font-bold">{formatCost(estSavings)}</p>
          </div>
        </div>
        {cacheStats && cacheStats.length > 0 ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-border">
                {['Scope', 'Entries', 'Hits', 'Avg Hits/Entry', 'Oldest'].map((h, i) => (
                  <th key={h} className={`text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {cacheStats.map((s) => (
                  <tr key={s.scope} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 text-foreground text-sm font-mono">{s.scope}</td>
                    <td className="px-5 py-3 text-right text-foreground text-sm">{s.entries.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-foreground text-sm">{s.total_hits.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground text-sm">{s.avg_hits_per_entry.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground text-sm">{s.oldest_entry ? new Date(s.oldest_entry).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <p className="text-muted-foreground text-sm">Cache is empty — first hits will land here once Cerebro/search/clip classifiers fire.</p>
          </div>
        )}
      </div>

      {/* ── Infrastructure ── */}
      <div>
        <h3 className="text-foreground font-semibold mb-3">Infrastructure</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Vercel */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Server size={16} className="text-muted-foreground" />
              <h4 className="text-foreground font-semibold text-sm">Vercel</h4>
              <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground ml-auto">{vercel?.plan || 'Free'}</span>
            </div>
            {vercel?.totalDeployments !== undefined ? (
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">Deployments</span><span className="text-foreground text-sm">{vercel.totalDeployments}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">Successful</span><span className="text-green-400 text-sm">{vercel.successfulDeployments}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">Failed</span><span className={`text-sm ${Number(vercel.failedDeployments) > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>{vercel.failedDeployments}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">Success Rate</span><span className="text-foreground text-sm">{vercel.successRate}%</span></div>
              </div>
            ) : <p className="text-muted-foreground text-sm">{vercel?.status === 'error' ? 'Could not connect' : 'Loading...'}</p>}
          </div>

          {/* Supabase */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database size={16} className="text-muted-foreground" />
              <h4 className="text-foreground font-semibold text-sm">Supabase</h4>
              <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground ml-auto">{supabase?.plan || 'Free'}</span>
            </div>
            {supabase?.tableBreakdown ? (
              <div className="space-y-1.5">
                {supabase.dbSize && (
                  <div className="mb-3 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Database Size</span>
                      <span className="text-foreground text-xs">{supabase.dbSize} / {supabase.dbSizeLimit}</span>
                    </div>
                    <div className="w-full bg-background rounded-full h-2">
                      <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${Math.min(((supabase.dbSizeBytes ?? 0) / (500 * 1024 * 1024)) * 100, 100)}%` }} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">File Storage</span>
                      <span className="text-foreground text-xs">{supabase.storageFiles ?? 0} files ({(supabase.storageBytes ?? 0) > 1024 * 1024 ? `${((supabase.storageBytes ?? 0) / 1024 / 1024).toFixed(1)} MB` : `${((supabase.storageBytes ?? 0) / 1024).toFixed(0)} KB`}) / {supabase.storageLimit}</span>
                    </div>
                    <div className="w-full bg-background rounded-full h-2">
                      <div className="h-full bg-green-500/60 rounded-full" style={{ width: `${Math.min(((supabase.storageBytes ?? 0) / (1024 * 1024 * 1024)) * 100, 100)}%` }} />
                    </div>
                    <div className="border-b border-border my-2" />
                  </div>
                )}
                {supabase.tableBreakdown.map((t) => (
                  <div key={t.table} className="flex justify-between">
                    <span className="text-muted-foreground text-xs font-mono">{t.table}</span>
                    <span className="text-foreground text-xs">{Number(t.rows).toLocaleString()} rows</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1.5 mt-1.5">
                  <span className="text-foreground text-xs font-semibold">Total</span>
                  <span className="text-foreground text-xs font-semibold">{(supabase?.totalRows ?? 0).toLocaleString()} rows</span>
                </div>
              </div>
            ) : <p className="text-muted-foreground text-sm">{supabase?.status === 'error' ? 'Could not connect' : 'Loading...'}</p>}
          </div>

          {/* GitHub */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={16} className="text-muted-foreground" />
              <h4 className="text-foreground font-semibold text-sm">GitHub</h4>
            </div>
            {github?.repo ? (
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">Repository</span><span className="text-foreground text-sm">{github.repo}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">Commits</span><span className="text-foreground text-sm">{github.commits}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">Size</span><span className="text-foreground text-sm">{github.size ? `${(Number(github.size) / 1024).toFixed(1)} MB` : '...'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground text-xs">Branch</span><span className="text-foreground text-sm">{github.defaultBranch}</span></div>
              </div>
            ) : <p className="text-muted-foreground text-sm">{github?.status === 'error' ? 'Could not connect' : 'Loading...'}</p>}
          </div>

          {/* Clerk */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-muted-foreground" />
              <h4 className="text-foreground font-semibold text-sm">Clerk</h4>
              <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground ml-auto">{clerk?.plan || 'Free'}</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground text-xs">Total Users</span><span className="text-foreground text-sm">{clerk?.totalUsers ?? '...'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground text-xs">Status</span><span className="text-green-400 text-sm">Active</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
