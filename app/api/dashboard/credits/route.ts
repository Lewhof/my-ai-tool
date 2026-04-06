import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const results: Record<string, unknown> = {};

  // 1. Helicone — AI usage costs (last 30 days)
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const heliconeRes = await fetch('https://api.helicone.ai/v1/request/query', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HELICONE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          request: {
            created_at: { gte: thirtyDaysAgo.toISOString() },
          },
        },
        limit: 1000,
        sort: { created_at: 'desc' },
      }),
    });

    if (heliconeRes.ok) {
      const heliconeData = await heliconeRes.json();
      const requests = heliconeData.data ?? [];
      let totalCost = 0;
      let totalRequests = 0;
      let totalTokens = 0;
      const modelCosts: Record<string, { cost: number; requests: number }> = {};

      for (const req of requests) {
        const cost = req.response_cost_usd ?? 0;
        const tokens = (req.prompt_tokens ?? 0) + (req.completion_tokens ?? 0);
        const model = req.model ?? 'unknown';

        totalCost += cost;
        totalRequests++;
        totalTokens += tokens;

        if (!modelCosts[model]) modelCosts[model] = { cost: 0, requests: 0 };
        modelCosts[model].cost += cost;
        modelCosts[model].requests++;
      }

      results.ai = {
        totalCost: Math.round(totalCost * 10000) / 10000,
        totalRequests,
        totalTokens,
        models: modelCosts,
        period: '30 days',
      };
    } else {
      results.ai = { error: 'Could not fetch Helicone data' };
    }
  } catch {
    results.ai = { error: 'Helicone API unavailable' };
  }

  // 2. Vercel — usage
  try {
    const vercelRes = await fetch(
      `https://api.vercel.com/v1/usage?projectId=${process.env.VERCEL_PROJECT_ID}`,
      {
        headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
      }
    );

    if (vercelRes.ok) {
      const vercelData = await vercelRes.json();
      results.vercel = {
        bandwidth: vercelData,
      };
    } else {
      // Try getting deployment count as fallback
      const deploys = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${process.env.VERCEL_PROJECT_ID}&limit=1`,
        { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } }
      );
      if (deploys.ok) {
        results.vercel = { status: 'connected' };
      } else {
        results.vercel = { error: 'Could not fetch Vercel usage' };
      }
    }
  } catch {
    results.vercel = { error: 'Vercel API unavailable' };
  }

  // 3. Supabase — basic project info
  results.supabase = { status: 'connected', tier: 'Free' };

  // 4. Clerk — basic info
  results.clerk = { status: 'connected', tier: 'Free (dev keys)' };

  return Response.json(results);
}
