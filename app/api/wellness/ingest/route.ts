import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// POST /api/wellness/ingest
// Generic ingestion endpoint for wellness metrics. Accepts:
//   { source: 'garmin' | 'apple_health' | 'manual' | 'demo',
//     metrics: [{ date, metric, value, unit?, raw? }] }
//
// Upserts on (user_id, date, source, metric). Safe to call repeatedly.

type IngestMetric = {
  date: string;           // 'YYYY-MM-DD'
  metric: string;         // 'steps' | 'sleep_hours' | etc.
  value: number | null;
  unit?: string;
  raw?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  let body: { source?: string; metrics?: IngestMetric[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const source = body.source;
  const metrics = body.metrics;
  if (!source || !Array.isArray(metrics) || metrics.length === 0) {
    return Response.json({ error: 'source and metrics[] required' }, { status: 400 });
  }
  const allowedSources = ['garmin', 'apple_health', 'manual', 'demo'];
  if (!allowedSources.includes(source)) {
    return Response.json({ error: `source must be one of ${allowedSources.join(', ')}` }, { status: 400 });
  }

  const rows = metrics.map((m) => ({
    user_id: userId,
    date: m.date,
    source,
    metric: m.metric,
    value: m.value,
    unit: m.unit ?? null,
    raw_jsonb: m.raw ?? null,
  }));

  const { error, data } = await supabaseAdmin
    .from('wellness_metrics')
    .upsert(rows, { onConflict: 'user_id,date,source,metric' })
    .select('id');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ingested: data?.length ?? 0 });
}

// DELETE /api/wellness/ingest?source=demo  — wipe demo data
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const source = url.searchParams.get('source');
  if (!source) return Response.json({ error: 'source query param required' }, { status: 400 });

  const { error, data } = await supabaseAdmin
    .from('wellness_metrics')
    .delete()
    .eq('user_id', userId)
    .eq('source', source)
    .select('id');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deleted: data?.length ?? 0 });
}
