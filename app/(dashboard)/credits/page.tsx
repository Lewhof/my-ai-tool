'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  DollarSign, Zap, Clock, AlertTriangle, CheckCircle, BarChart3,
  Server, Database, Users, GitBranch, Shield,
} from 'lucide-react';

interface ModelStats {
  cost: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  avgLatency: number;
}

interface PeriodData {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalRequests: number;
  avgLatency: number;
  avgCostPerRequest: number;
  successRate: number;
  errorCount: number;
  models: Record<string, ModelStats>;
}

interface CreditsResponse {
  helicone?: {
    status: string;
    periods?: Record<string, PeriodData>;
    message?: string;
  };
  vercel?: {
    status: string;
    plan?: string;
    totalDeployments?: number;
    successfulDeployments?: number;
    failedDeployments?: number;
    successRate?: number;
  };
  supabase?: {
    status: string;
    plan?: string;
    tables?: number;
    totalRows?: number;
    tableBreakdown?: Array<{ table: string; rows: number }>;
  };
  clerk?: {
    status: string;
    plan?: string;
    totalUsers?: number;
  };
  github?: {
    status: string;
    repo?: string;
    size?: number;
    commits?: number;
    defaultBranch?: string;
  };
}

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
  if (model.includes('gpt')) return 'bg-emerald-500';
  return 'bg-gray-500';
}

function modelColorText(model: string): string {
  if (model.includes('haiku')) return 'text-green-400';
  if (model.includes('sonnet')) return 'text-blue-400';
  if (model.includes('opus')) return 'text-purple-400';
  if (model.includes('gpt')) return 'text-emerald-400';
  return 'text-gray-400';
}

const PERIOD_TABS = ['Today', '7 days', '30 days', '90 days'];

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-400' : 'bg-red-400'}`} />;
}

export default function CreditsPage() {
  const [data, setData] = useState<CreditsResponse | null>(null);
  const [activePeriod, setActivePeriod] = useState('30 days');

  useEffect(() => {
    fetch('/api/credits').then((r) => r.json()).then(setData);
  }, []);

  const period = data?.helicone?.periods?.[activePeriod];

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-bold text-white">AI Credits & Usage</h2>
        <p className="text-gray-500 text-sm mt-1">Full stack metrics across all services</p>
      </div>

      {/* ── Service Status Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { name: 'Anthropic (Helicone)', icon: Zap, status: data?.helicone?.status === 'connected', detail: period ? `${period.totalRequests} requests` : 'No data' },
          { name: 'Vercel', icon: Server, status: data?.vercel?.status === 'connected', detail: data?.vercel?.plan || 'Checking...' },
          { name: 'Supabase', icon: Database, status: data?.supabase?.status === 'connected', detail: data?.supabase?.tables ? `${data.supabase.tables} tables` : 'Checking...' },
          { name: 'Clerk', icon: Users, status: data?.clerk?.status === 'connected', detail: data?.clerk?.plan || 'Checking...' },
          { name: 'GitHub', icon: GitBranch, status: data?.github?.status === 'connected', detail: data?.github?.repo || 'Checking...' },
        ].map((svc) => (
          <div key={svc.name} className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
            <StatusDot ok={svc.status} />
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{svc.name}</p>
              <p className="text-gray-500 text-xs truncate">{svc.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── AI Usage Section ── */}
      <div>
        <h3 className="text-white font-semibold mb-3">AI Usage (Anthropic)</h3>
        <div className="flex gap-2 mb-4">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActivePeriod(tab)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium border transition-colors',
                activePeriod === tab
                  ? 'bg-white text-gray-900 border-white'
                  : 'text-gray-400 border-gray-600 hover:border-gray-400'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {!data ? (
          <p className="text-gray-500">Loading...</p>
        ) : !period || period.totalRequests === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
            <p className="text-gray-500">No AI usage data for this period. Send a message in Chat to start tracking.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><DollarSign size={14} className="text-accent-500" /><p className="text-gray-400 text-xs">Spend</p></div>
                <p className="text-white text-2xl font-bold">{formatCost(period.totalCost)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><Zap size={14} className="text-yellow-500" /><p className="text-gray-400 text-xs">Requests</p></div>
                <p className="text-white text-2xl font-bold">{period.totalRequests.toLocaleString()}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><BarChart3 size={14} className="text-blue-500" /><p className="text-gray-400 text-xs">Tokens</p></div>
                <p className="text-white text-2xl font-bold">{formatTokens(period.totalTokens)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><DollarSign size={14} className="text-gray-500" /><p className="text-gray-400 text-xs">Avg/Req</p></div>
                <p className="text-white text-2xl font-bold">{formatCost(period.avgCostPerRequest)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2"><Clock size={14} className="text-cyan-500" /><p className="text-gray-400 text-xs">Latency</p></div>
                <p className="text-white text-2xl font-bold">{period.avgLatency < 1000 ? `${period.avgLatency}ms` : `${(period.avgLatency / 1000).toFixed(1)}s`}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">{period.errorCount > 0 ? <AlertTriangle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-green-500" />}<p className="text-gray-400 text-xs">Success</p></div>
                <p className="text-white text-2xl font-bold">{period.successRate}%</p>
              </div>
            </div>

            {/* Model Table */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-700">
                <h4 className="text-white font-semibold text-sm">Cost by Model</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Model</th>
                      <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Requests</th>
                      <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Input</th>
                      <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Output</th>
                      <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Latency</th>
                      <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {Object.entries(period.models).sort(([, a], [, b]) => b.cost - a.cost).map(([model, s]) => (
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
                  <tfoot>
                    <tr className="border-t border-gray-600">
                      <td className="px-5 py-3 text-white text-sm font-semibold">Total</td>
                      <td className="px-5 py-3 text-right text-white text-sm font-semibold">{period.totalRequests.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-white text-sm font-semibold">{formatTokens(period.totalInputTokens)}</td>
                      <td className="px-5 py-3 text-right text-white text-sm font-semibold">{formatTokens(period.totalOutputTokens)}</td>
                      <td className="px-5 py-3 text-right text-white text-sm font-semibold">{period.avgLatency < 1000 ? `${period.avgLatency}ms` : `${(period.avgLatency / 1000).toFixed(1)}s`}</td>
                      <td className="px-5 py-3 text-right text-white text-sm font-semibold">{formatCost(period.totalCost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Token Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <h4 className="text-white font-semibold text-sm mb-4">Token Split</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-gray-400 text-xs">Input</span><span className="text-white text-sm">{formatTokens(period.totalInputTokens)}</span></div>
                    <div className="w-full bg-gray-900 rounded-full h-3"><div className="h-full bg-blue-500/60 rounded-full" style={{ width: period.totalTokens > 0 ? `${(period.totalInputTokens / period.totalTokens) * 100}%` : '0%' }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-gray-400 text-xs">Output</span><span className="text-white text-sm">{formatTokens(period.totalOutputTokens)}</span></div>
                    <div className="w-full bg-gray-900 rounded-full h-3"><div className="h-full bg-accent-600/60 rounded-full" style={{ width: period.totalTokens > 0 ? `${(period.totalOutputTokens / period.totalTokens) * 100}%` : '0%' }} /></div>
                  </div>
                </div>
              </div>

              {/* Model Cost Distribution */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <h4 className="text-white font-semibold text-sm mb-4">Cost Distribution</h4>
                <div className="space-y-2">
                  {Object.entries(period.models).sort(([, a], [, b]) => b.cost - a.cost).map(([model, s]) => (
                    <div key={model} className="flex items-center gap-3">
                      <span className={`text-xs font-mono w-32 truncate ${modelColorText(model)}`}>{model.split('/').pop()}</span>
                      <div className="flex-1 bg-gray-900 rounded-full h-3">
                        <div className={`h-full rounded-full ${modelColor(model)}/60`} style={{ width: period.totalCost > 0 ? `${(s.cost / period.totalCost) * 100}%` : '0%' }} />
                      </div>
                      <span className="text-white text-xs w-16 text-right">{period.totalCost > 0 ? `${Math.round((s.cost / period.totalCost) * 100)}%` : '0%'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Infrastructure Section ── */}
      <div>
        <h3 className="text-white font-semibold mb-3">Infrastructure</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Vercel */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Server size={16} className="text-gray-400" />
              <h4 className="text-white font-semibold text-sm">Vercel</h4>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400 ml-auto">{data?.vercel?.plan || '...'}</span>
            </div>
            {data?.vercel?.totalDeployments !== undefined ? (
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Deployments (recent)</span><span className="text-white text-sm">{data.vercel.totalDeployments}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Successful</span><span className="text-green-400 text-sm">{data.vercel.successfulDeployments}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Failed</span><span className={`text-sm ${(data.vercel.failedDeployments ?? 0) > 0 ? 'text-red-400' : 'text-gray-400'}`}>{data.vercel.failedDeployments}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Success Rate</span><span className="text-white text-sm">{data.vercel.successRate}%</span></div>
              </div>
            ) : <p className="text-gray-500 text-sm">Loading...</p>}
          </div>

          {/* Supabase */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database size={16} className="text-gray-400" />
              <h4 className="text-white font-semibold text-sm">Supabase</h4>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400 ml-auto">{data?.supabase?.plan || '...'}</span>
            </div>
            {data?.supabase?.tableBreakdown ? (
              <div className="space-y-1.5">
                {data.supabase.tableBreakdown.map((t) => (
                  <div key={t.table} className="flex justify-between">
                    <span className="text-gray-400 text-xs font-mono">{t.table}</span>
                    <span className="text-white text-xs">{Number(t.rows).toLocaleString()} rows</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5">
                  <span className="text-gray-300 text-xs font-semibold">Total</span>
                  <span className="text-white text-xs font-semibold">{data.supabase.totalRows?.toLocaleString()} rows</span>
                </div>
              </div>
            ) : <p className="text-gray-500 text-sm">Loading...</p>}
          </div>

          {/* GitHub */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={16} className="text-gray-400" />
              <h4 className="text-white font-semibold text-sm">GitHub</h4>
            </div>
            {data?.github?.repo ? (
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Repository</span><span className="text-white text-sm">{data.github.repo}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Commits (recent)</span><span className="text-white text-sm">{data.github.commits}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Size</span><span className="text-white text-sm">{data.github.size ? `${(data.github.size / 1024).toFixed(1)} MB` : '...'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 text-xs">Branch</span><span className="text-white text-sm">{data.github.defaultBranch}</span></div>
              </div>
            ) : <p className="text-gray-500 text-sm">Loading...</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
