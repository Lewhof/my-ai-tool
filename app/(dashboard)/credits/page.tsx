'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  DollarSign, Zap, Clock, AlertTriangle, CheckCircle, BarChart3,
  Server, Database, Users, GitBranch,
} from 'lucide-react';

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
  return 'bg-gray-500';
}

function modelColorText(model: string): string {
  if (model.includes('haiku')) return 'text-green-400';
  if (model.includes('sonnet')) return 'text-blue-400';
  if (model.includes('opus')) return 'text-purple-400';
  return 'text-gray-400';
}

function StatusCard({ name, icon: Icon, status, detail }: { name: string; icon: typeof Zap; status: string; detail: string }) {
  const ok = status === 'connected';
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-400' : status === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`} />
      <Icon size={14} className="text-gray-500 shrink-0" />
      <div className="min-w-0">
        <p className="text-white text-xs font-medium truncate">{name}</p>
        <p className="text-gray-500 text-xs truncate">{detail}</p>
      </div>
    </div>
  );
}

const PERIOD_TABS = ['Today', '7 days', '30 days', '90 days'];

export default function CreditsPage() {
  const [apiData, setApiData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState('30 days');

  useEffect(() => {
    fetch('/api/credits')
      .then((r) => r.json())
      .then((d) => { setApiData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Extract data safely
  const helicone = apiData?.helicone as Record<string, unknown> | undefined;
  const periods = helicone?.periods as Record<string, Record<string, unknown>> | undefined;
  const period = periods?.[activePeriod];
  const vercel = apiData?.vercel as { status: string; plan?: string; totalDeployments?: number; successfulDeployments?: number; failedDeployments?: number; successRate?: number } | undefined;
  const supabase = apiData?.supabase as { status: string; plan?: string; tables?: number; totalRows?: number; tableBreakdown?: Array<{ table: string; rows: number }>; dbSize?: string; dbSizeBytes?: number; dbSizeLimit?: string; storageFiles?: number; storageBytes?: number; storageLimit?: string } | undefined;
  const clerk = apiData?.clerk as { status: string; plan?: string; totalUsers?: number } | undefined;
  const github = apiData?.github as { status: string; repo?: string; size?: number; commits?: number; defaultBranch?: string } | undefined;

  // Cast period to concrete type
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

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-bold text-white">AI Credits & Usage</h2>
        <p className="text-gray-500 text-sm mt-1">Full stack metrics across all services</p>
      </div>

      {/* ── Service Status ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatusCard name="Anthropic" icon={Zap} status={loading ? 'loading' : helicone?.status === 'connected' ? 'connected' : 'error'} detail={hasPeriodData ? `${p!.totalRequests} requests` : helicone?.status === 'connected' ? 'No usage yet' : String(helicone?.message || 'Not connected')} />
        <StatusCard name="Vercel" icon={Server} status={loading ? 'loading' : vercel?.status === 'connected' ? 'connected' : 'error'} detail={vercel?.plan as string || 'Checking...'} />
        <StatusCard name="Supabase" icon={Database} status={loading ? 'loading' : supabase?.status === 'connected' ? 'connected' : 'error'} detail={supabase?.tables ? `${supabase.tables} tables, ${supabase.totalRows} rows` : 'Checking...'} />
        <StatusCard name="Clerk" icon={Users} status={loading ? 'loading' : clerk?.status === 'connected' ? 'connected' : 'error'} detail={clerk?.plan as string || 'Checking...'} />
        <StatusCard name="GitHub" icon={GitBranch} status={loading ? 'loading' : github?.status === 'connected' ? 'connected' : 'error'} detail={github?.repo as string || 'Checking...'} />
      </div>

      {/* ── AI Usage ── */}
      <div>
        <h3 className="text-white font-semibold mb-3">AI Usage (Anthropic via Helicone)</h3>
        <div className="flex gap-2 mb-4">
          {PERIOD_TABS.map((tab) => (
            <button key={tab} onClick={() => setActivePeriod(tab)} className={cn('px-4 py-2 rounded-full text-sm font-medium border transition-colors', activePeriod === tab ? 'bg-white text-gray-900 border-white' : 'text-gray-400 border-gray-600 hover:border-gray-400')}>
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading AI metrics...</p>
        ) : !hasPeriodData ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
            <Zap size={24} className="mx-auto text-gray-600 mb-2" />
            <p className="text-gray-400 text-sm">No AI usage for this period.</p>
            <p className="text-gray-600 text-xs mt-1">Send a message in Chat to start tracking costs.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><DollarSign size={14} className="text-accent-500" /><p className="text-gray-400 text-xs">Spend</p></div>
                <p className="text-white text-2xl font-bold">{formatCost(p!.totalCost)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><Zap size={14} className="text-yellow-500" /><p className="text-gray-400 text-xs">Requests</p></div>
                <p className="text-white text-2xl font-bold">{(p!.totalRequests).toLocaleString()}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><BarChart3 size={14} className="text-blue-500" /><p className="text-gray-400 text-xs">Tokens</p></div>
                <p className="text-white text-2xl font-bold">{formatTokens(p!.totalTokens)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><DollarSign size={14} className="text-gray-500" /><p className="text-gray-400 text-xs">Avg/Req</p></div>
                <p className="text-white text-2xl font-bold">{formatCost(p!.avgCostPerRequest)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><Clock size={14} className="text-cyan-500" /><p className="text-gray-400 text-xs">Latency</p></div>
                <p className="text-white text-2xl font-bold">{(p!.avgLatency) < 1000 ? `${p!.avgLatency}ms` : `${((p!.avgLatency) / 1000).toFixed(1)}s`}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">{(p!.errorCount) > 0 ? <AlertTriangle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-green-500" />}<p className="text-gray-400 text-xs">Success</p></div>
                <p className="text-white text-2xl font-bold">{p!.successRate}%</p>
              </div>
            </div>

            {/* Model Table */}
            {p!.models && Object.keys(p!.models).length > 0 && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-700"><h4 className="text-white font-semibold text-sm">Cost by Model</h4></div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-700">
                      {['Model', 'Requests', 'Input', 'Output', 'Latency', 'Cost'].map((h, i) => (
                        <th key={h} className={`text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-700">
                      {Object.entries(p!.models).sort(([, a], [, b]) => b.cost - a.cost).map(([model, s]) => (
                        <tr key={model} className="hover:bg-gray-700/30">
                          <td className="px-5 py-3"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${modelColor(model)}`} /><span className={`text-sm font-mono ${modelColorText(model)}`}>{model}</span></div></td>
                          <td className="px-5 py-3 text-right text-white text-sm">{s.requests.toLocaleString()}</td>
                          <td className="px-5 py-3 text-right text-gray-400 text-sm">{formatTokens(s.inputTokens)}</td>
                          <td className="px-5 py-3 text-right text-gray-400 text-sm">{formatTokens(s.outputTokens)}</td>
                          <td className="px-5 py-3 text-right text-gray-400 text-sm">{s.avgLatency < 1000 ? `${s.avgLatency}ms` : `${(s.avgLatency / 1000).toFixed(1)}s`}</td>
                          <td className="px-5 py-3 text-right text-white text-sm font-medium">{formatCost(s.cost)}</td>
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

      {/* ── Infrastructure ── */}
      <div>
        <h3 className="text-white font-semibold mb-3">Infrastructure</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Vercel */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Server size={16} className="text-gray-400" />
              <h4 className="text-white font-semibold text-sm">Vercel</h4>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400 ml-auto">{vercel?.plan || 'Free'}</span>
            </div>
            {vercel?.totalDeployments !== undefined ? (
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Deployments</span><span className="text-white text-sm">{vercel.totalDeployments}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Successful</span><span className="text-green-400 text-sm">{vercel.successfulDeployments}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Failed</span><span className={`text-sm ${Number(vercel.failedDeployments) > 0 ? 'text-red-400' : 'text-gray-400'}`}>{vercel.failedDeployments}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Success Rate</span><span className="text-white text-sm">{vercel.successRate}%</span></div>
              </div>
            ) : <p className="text-gray-500 text-sm">{vercel?.status === 'error' ? 'Could not connect' : 'Loading...'}</p>}
          </div>

          {/* Supabase */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database size={16} className="text-gray-400" />
              <h4 className="text-white font-semibold text-sm">Supabase</h4>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400 ml-auto">{supabase?.plan || 'Free'}</span>
            </div>
            {supabase?.tableBreakdown ? (
              <div className="space-y-1.5">
                {supabase.dbSize && (
                  <div className="mb-3 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-xs">Database Size</span>
                      <span className="text-white text-xs">{supabase.dbSize} / {supabase.dbSizeLimit}</span>
                    </div>
                    <div className="w-full bg-gray-900 rounded-full h-2">
                      <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${Math.min(((supabase.dbSizeBytes ?? 0) / (500 * 1024 * 1024)) * 100, 100)}%` }} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-xs">File Storage</span>
                      <span className="text-white text-xs">{supabase.storageFiles ?? 0} files ({(supabase.storageBytes ?? 0) > 1024 * 1024 ? `${((supabase.storageBytes ?? 0) / 1024 / 1024).toFixed(1)} MB` : `${((supabase.storageBytes ?? 0) / 1024).toFixed(0)} KB`}) / {supabase.storageLimit}</span>
                    </div>
                    <div className="w-full bg-gray-900 rounded-full h-2">
                      <div className="h-full bg-green-500/60 rounded-full" style={{ width: `${Math.min(((supabase.storageBytes ?? 0) / (1024 * 1024 * 1024)) * 100, 100)}%` }} />
                    </div>
                    <div className="border-b border-gray-700 my-2" />
                  </div>
                )}
                {supabase.tableBreakdown.map((t) => (
                  <div key={t.table} className="flex justify-between">
                    <span className="text-gray-400 text-xs font-mono">{t.table}</span>
                    <span className="text-white text-xs">{Number(t.rows).toLocaleString()} rows</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5">
                  <span className="text-gray-300 text-xs font-semibold">Total</span>
                  <span className="text-white text-xs font-semibold">{(supabase?.totalRows ?? 0).toLocaleString()} rows</span>
                </div>
              </div>
            ) : <p className="text-gray-500 text-sm">{supabase?.status === 'error' ? 'Could not connect' : 'Loading...'}</p>}
          </div>

          {/* GitHub */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={16} className="text-gray-400" />
              <h4 className="text-white font-semibold text-sm">GitHub</h4>
            </div>
            {github?.repo ? (
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Repository</span><span className="text-white text-sm">{github.repo}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Commits</span><span className="text-white text-sm">{github.commits}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Size</span><span className="text-white text-sm">{github.size ? `${(Number(github.size) / 1024).toFixed(1)} MB` : '...'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Branch</span><span className="text-white text-sm">{github.defaultBranch}</span></div>
              </div>
            ) : <p className="text-gray-500 text-sm">{github?.status === 'error' ? 'Could not connect' : 'Loading...'}</p>}
          </div>

          {/* Clerk */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-gray-400" />
              <h4 className="text-white font-semibold text-sm">Clerk</h4>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400 ml-auto">{clerk?.plan || 'Free'}</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-gray-400 text-xs">Total Users</span><span className="text-white text-sm">{clerk?.totalUsers ?? '...'}</span></div>
              <div className="flex justify-between"><span className="text-gray-400 text-xs">Status</span><span className="text-green-400 text-sm">Active</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
