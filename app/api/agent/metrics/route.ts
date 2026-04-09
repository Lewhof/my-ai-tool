import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET /api/agent/metrics?days=7
// Returns tool-level aggregates over the window:
//   - total calls
//   - success rate
//   - p50 / p95 latency
// Also purges rows older than 90 days (retention policy).

type MetricRow = {
  tool_name: string;
  duration_ms: number;
  success: boolean;
  error_message: string | null;
};

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get('days') || '7', 10), 90);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Fire-and-forget 90-day retention sweep (only runs one delete per request;
  // cheap because the index covers (user_id, called_at).
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  void supabaseAdmin
    .from('cerebro_tool_metrics')
    .delete()
    .eq('user_id', userId)
    .lt('called_at', cutoff);

  const { data, error } = await supabaseAdmin
    .from('cerebro_tool_metrics')
    .select('tool_name, duration_ms, success, error_message')
    .eq('user_id', userId)
    .gte('called_at', since)
    .order('called_at', { ascending: false })
    .limit(5000);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as MetricRow[];
  const byTool: Record<string, { calls: number; successes: number; durations: number[]; lastError: string | null }> = {};

  for (const r of rows) {
    if (!byTool[r.tool_name]) {
      byTool[r.tool_name] = { calls: 0, successes: 0, durations: [], lastError: null };
    }
    const b = byTool[r.tool_name];
    b.calls++;
    if (r.success) b.successes++;
    else if (r.error_message && !b.lastError) b.lastError = r.error_message;
    b.durations.push(r.duration_ms);
  }

  const percentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  };

  const tools = Object.entries(byTool)
    .map(([name, b]) => ({
      tool_name: name,
      calls: b.calls,
      success_rate: b.calls > 0 ? b.successes / b.calls : 1,
      p50_ms: percentile(b.durations, 50),
      p95_ms: percentile(b.durations, 95),
      last_error: b.lastError,
    }))
    .sort((a, b) => b.calls - a.calls);

  const totalCalls = rows.length;
  const totalSuccesses = rows.filter((r) => r.success).length;

  return Response.json({
    window_days: days,
    total_calls: totalCalls,
    overall_success_rate: totalCalls > 0 ? totalSuccesses / totalCalls : 1,
    tools,
  });
}
