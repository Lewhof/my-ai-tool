import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET /api/wellness/summary
// Returns:
//   - today:   latest value per metric for today (or most recent if empty)
//   - trends:  last 30 days of each metric as {date, value}[]
//   - workouts: last 10 workout raw_jsonb entries
//   - sources: list of distinct sources we've seen

type MetricRow = {
  date: string;
  source: string;
  metric: string;
  value: number | null;
  unit: string | null;
  raw_jsonb: Record<string, unknown> | null;
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Pull last 90 days
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('wellness_metrics')
    .select('date, source, metric, value, unit, raw_jsonb')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data as MetricRow[]) ?? [];
  const sources = Array.from(new Set(rows.map((r) => r.source)));

  // Today: most recent value per non-workout metric
  const today: Record<string, { value: number | null; unit: string | null; date: string; source: string }> = {};
  for (const r of rows) {
    if (r.metric === 'workout') continue;
    if (!today[r.metric]) {
      today[r.metric] = { value: r.value, unit: r.unit, date: r.date, source: r.source };
    }
  }

  // Trends: last 30 days, by metric
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const trends: Record<string, Array<{ date: string; value: number }>> = {};
  for (const r of rows) {
    if (r.metric === 'workout') continue;
    if (r.date < thirtyAgo) continue;
    if (r.value === null) continue;
    if (!trends[r.metric]) trends[r.metric] = [];
    // Only keep one entry per (metric, date) — prefer first seen (most recent source wins)
    if (!trends[r.metric].find((t) => t.date === r.date)) {
      trends[r.metric].push({ date: r.date, value: Number(r.value) });
    }
  }
  // Sort ascending by date for chart rendering
  for (const k of Object.keys(trends)) {
    trends[k].sort((a, b) => a.date.localeCompare(b.date));
  }

  // Recent workouts
  const workouts = rows
    .filter((r) => r.metric === 'workout')
    .slice(0, 10)
    .map((r) => ({ date: r.date, source: r.source, ...(r.raw_jsonb ?? {}) }));

  return Response.json({
    today,
    trends,
    workouts,
    sources,
    total_entries: rows.length,
  });
}
