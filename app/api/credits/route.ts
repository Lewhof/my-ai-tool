import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const heliconeKey = process.env.HELICONE_API_KEY;
  if (!heliconeKey) return Response.json({ error: 'Helicone not configured' }, { status: 500 });

  const now = new Date();
  const periods = [
    { label: 'Today', start: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
    { label: '7 days', start: new Date(now.getTime() - 7 * 86400000) },
    { label: '30 days', start: new Date(now.getTime() - 30 * 86400000) },
    { label: '90 days', start: new Date(now.getTime() - 90 * 86400000) },
  ];

  const results: Record<string, unknown> = {};

  for (const period of periods) {
    try {
      const res = await fetch('https://api.helicone.ai/v1/request/query', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${heliconeKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            request: {
              created_at: { gte: period.start.toISOString() },
            },
          },
          limit: 2000,
          sort: { created_at: 'desc' },
        }),
      });

      if (!res.ok) {
        results[period.label] = { error: 'Failed to fetch' };
        continue;
      }

      const data = await res.json();
      const requests = data.data ?? [];

      let totalCost = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalRequests = 0;
      let totalLatency = 0;
      const modelBreakdown: Record<string, { cost: number; requests: number; inputTokens: number; outputTokens: number; avgLatency: number; latencySum: number }> = {};
      const dailyCosts: Record<string, number> = {};
      const hourlyCosts: Record<number, number> = {};
      let successCount = 0;
      let errorCount = 0;

      for (const req of requests) {
        const cost = req.response_cost_usd ?? 0;
        const inputTokens = req.prompt_tokens ?? 0;
        const outputTokens = req.completion_tokens ?? 0;
        const model = req.model ?? 'unknown';
        const latency = req.delay_ms ?? 0;
        const status = req.response_status;
        const createdAt = new Date(req.request_created_at ?? req.created_at ?? now);

        totalCost += cost;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        totalRequests++;
        totalLatency += latency;

        if (status >= 200 && status < 300) successCount++;
        else errorCount++;

        if (!modelBreakdown[model]) {
          modelBreakdown[model] = { cost: 0, requests: 0, inputTokens: 0, outputTokens: 0, avgLatency: 0, latencySum: 0 };
        }
        modelBreakdown[model].cost += cost;
        modelBreakdown[model].requests++;
        modelBreakdown[model].inputTokens += inputTokens;
        modelBreakdown[model].outputTokens += outputTokens;
        modelBreakdown[model].latencySum += latency;

        // Daily breakdown
        const dayKey = createdAt.toISOString().split('T')[0];
        dailyCosts[dayKey] = (dailyCosts[dayKey] ?? 0) + cost;

        // Hourly distribution
        const hour = createdAt.getHours();
        hourlyCosts[hour] = (hourlyCosts[hour] ?? 0) + 1;
      }

      // Calculate avg latency per model
      for (const model of Object.keys(modelBreakdown)) {
        const m = modelBreakdown[model];
        m.avgLatency = m.requests > 0 ? Math.round(m.latencySum / m.requests) : 0;
      }

      results[period.label] = {
        totalCost: Math.round(totalCost * 10000) / 10000,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        totalRequests,
        avgLatency: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
        avgCostPerRequest: totalRequests > 0 ? Math.round((totalCost / totalRequests) * 10000) / 10000 : 0,
        successRate: totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 0,
        errorCount,
        models: modelBreakdown,
        dailyCosts,
        hourlyCosts,
      };
    } catch {
      results[period.label] = { error: 'Helicone unavailable' };
    }
  }

  return Response.json(results);
}
