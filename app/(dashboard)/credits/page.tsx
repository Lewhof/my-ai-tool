'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { DollarSign, Zap, Clock, AlertTriangle, CheckCircle, BarChart3 } from 'lucide-react';

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
  models: Record<string, {
    cost: number;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    avgLatency: number;
  }>;
  dailyCosts: Record<string, number>;
  hourlyCosts: Record<string, number>;
  error?: string;
}

type Periods = Record<string, PeriodData>;

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

export default function CreditsPage() {
  const [data, setData] = useState<Periods | null>(null);
  const [activePeriod, setActivePeriod] = useState('30 days');

  useEffect(() => {
    fetch('/api/credits').then((r) => r.json()).then(setData);
  }, []);

  const period = data?.[activePeriod] as PeriodData | undefined;

  // Simple bar chart component
  const CostBar = ({ label, value, max }: { label: string; value: number; max: number }) => (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 text-xs w-20 text-right shrink-0">{label}</span>
      <div className="flex-1 bg-gray-900 rounded-full h-4 overflow-hidden">
        <div
          className="h-full bg-accent-600/60 rounded-full transition-all duration-500"
          style={{ width: max > 0 ? `${(value / max) * 100}%` : '0%' }}
        />
      </div>
      <span className="text-gray-400 text-xs w-16 shrink-0">{formatCost(value)}</span>
    </div>
  );

  // Hour distribution bar
  const HourBar = ({ hour, count, max }: { hour: number; count: number; max: number }) => (
    <div className="flex flex-col items-center gap-1">
      <div className="w-full bg-gray-900 rounded-sm overflow-hidden h-16 flex flex-col-reverse">
        <div
          className="w-full bg-accent-600/50 transition-all duration-500"
          style={{ height: max > 0 ? `${(count / max) * 100}%` : '0%' }}
        />
      </div>
      <span className="text-gray-600 text-xs">{hour.toString().padStart(2, '0')}</span>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">AI Credits & Usage</h2>
        <p className="text-gray-500 text-sm mt-1">Detailed cost and performance metrics via Helicone</p>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
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
        <p className="text-gray-500">Loading usage data...</p>
      ) : !period || period.error ? (
        <p className="text-gray-500">Could not load data for this period.</p>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={14} className="text-accent-500" />
                <p className="text-gray-400 text-xs">Total Spend</p>
              </div>
              <p className="text-white text-2xl font-bold">{formatCost(period.totalCost)}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-yellow-500" />
                <p className="text-gray-400 text-xs">Requests</p>
              </div>
              <p className="text-white text-2xl font-bold">{period.totalRequests.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={14} className="text-blue-500" />
                <p className="text-gray-400 text-xs">Total Tokens</p>
              </div>
              <p className="text-white text-2xl font-bold">{formatTokens(period.totalTokens)}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={14} className="text-gray-500" />
                <p className="text-gray-400 text-xs">Avg/Request</p>
              </div>
              <p className="text-white text-2xl font-bold">{formatCost(period.avgCostPerRequest)}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-cyan-500" />
                <p className="text-gray-400 text-xs">Avg Latency</p>
              </div>
              <p className="text-white text-2xl font-bold">{period.avgLatency < 1000 ? `${period.avgLatency}ms` : `${(period.avgLatency / 1000).toFixed(1)}s`}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                {period.errorCount > 0 ? <AlertTriangle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-green-500" />}
                <p className="text-gray-400 text-xs">Success Rate</p>
              </div>
              <p className="text-white text-2xl font-bold">{period.successRate}%</p>
              {period.errorCount > 0 && <p className="text-red-400 text-xs mt-0.5">{period.errorCount} errors</p>}
            </div>
          </div>

          {/* Token Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              <h3 className="text-white font-semibold text-sm mb-1">Token Usage</h3>
              <p className="text-gray-500 text-xs mb-4">Input vs Output tokens</p>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400 text-xs">Input tokens</span>
                    <span className="text-white text-sm font-medium">{formatTokens(period.totalInputTokens)}</span>
                  </div>
                  <div className="w-full bg-gray-900 rounded-full h-3">
                    <div
                      className="h-full bg-blue-500/60 rounded-full"
                      style={{ width: period.totalTokens > 0 ? `${(period.totalInputTokens / period.totalTokens) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400 text-xs">Output tokens</span>
                    <span className="text-white text-sm font-medium">{formatTokens(period.totalOutputTokens)}</span>
                  </div>
                  <div className="w-full bg-gray-900 rounded-full h-3">
                    <div
                      className="h-full bg-accent-600/60 rounded-full"
                      style={{ width: period.totalTokens > 0 ? `${(period.totalOutputTokens / period.totalTokens) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Hourly Distribution */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              <h3 className="text-white font-semibold text-sm mb-1">Usage by Hour</h3>
              <p className="text-gray-500 text-xs mb-4">Request distribution throughout the day</p>
              <div className="grid grid-cols-24 gap-0.5">
                {Array.from({ length: 24 }, (_, i) => {
                  const count = Number(period.hourlyCosts[i] ?? 0);
                  const max = Math.max(...Object.values(period.hourlyCosts).map(Number), 1);
                  return <HourBar key={i} hour={i} count={count} max={max} />;
                })}
              </div>
            </div>
          </div>

          {/* Model Breakdown */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-700">
              <h3 className="text-white font-semibold text-sm">Cost by Model</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Model</th>
                  <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Requests</th>
                  <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Input Tokens</th>
                  <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Output Tokens</th>
                  <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Avg Latency</th>
                  <th className="text-right text-gray-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {Object.entries(period.models)
                  .sort(([, a], [, b]) => b.cost - a.cost)
                  .map(([model, stats]) => (
                    <tr key={model} className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${modelColor(model)}`} />
                          <span className={`text-sm font-mono ${modelColorText(model)}`}>{model}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-white text-sm">{stats.requests.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-gray-400 text-sm">{formatTokens(stats.inputTokens)}</td>
                      <td className="px-5 py-3 text-right text-gray-400 text-sm">{formatTokens(stats.outputTokens)}</td>
                      <td className="px-5 py-3 text-right text-gray-400 text-sm">{stats.avgLatency < 1000 ? `${stats.avgLatency}ms` : `${(stats.avgLatency / 1000).toFixed(1)}s`}</td>
                      <td className="px-5 py-3 text-right text-white text-sm font-medium">{formatCost(stats.cost)}</td>
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

          {/* Daily Cost Trend */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <h3 className="text-white font-semibold text-sm mb-1">Daily Cost Trend</h3>
            <p className="text-gray-500 text-xs mb-4">Cost per day over the selected period</p>
            <div className="space-y-1.5">
              {Object.entries(period.dailyCosts)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-30)
                .map(([date, cost]) => {
                  const maxDailyCost = Math.max(...Object.values(period.dailyCosts), 0.001);
                  return <CostBar key={date} label={date.slice(5)} value={cost} max={maxDailyCost} />;
                })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
