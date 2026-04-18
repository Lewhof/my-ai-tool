import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const results: Record<string, unknown> = {};
  // Raw Helicone requests are captured during section 1 and reused by the
  // balance calculation at the bottom of this handler.
  let heliconeRequests: Array<{
    response_cost_usd?: number;
    request_created_at?: string;
    created_at?: string;
  }> = [];

  // ── 1. Helicone (AI Usage) ──
  try {
    const heliconeKey = process.env.HELICONE_API_KEY;
    if (heliconeKey) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

      const res = await fetch('https://api.helicone.ai/v1/request/query', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${heliconeKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            request: { created_at: { gte: ninetyDaysAgo } },
          },
          limit: 2000,
          sort: { created_at: 'desc' },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const requests = data.data ?? [];
        heliconeRequests = requests;

        const now = Date.now();
        const periods: Record<string, { cost: number; requests: number; inputTokens: number; outputTokens: number; latencySum: number; errors: number; models: Record<string, { cost: number; requests: number; inputTokens: number; outputTokens: number; latencySum: number }> }> = {
          'Today': { cost: 0, requests: 0, inputTokens: 0, outputTokens: 0, latencySum: 0, errors: 0, models: {} },
          '7 days': { cost: 0, requests: 0, inputTokens: 0, outputTokens: 0, latencySum: 0, errors: 0, models: {} },
          '30 days': { cost: 0, requests: 0, inputTokens: 0, outputTokens: 0, latencySum: 0, errors: 0, models: {} },
          '90 days': { cost: 0, requests: 0, inputTokens: 0, outputTokens: 0, latencySum: 0, errors: 0, models: {} },
        };

        const todayStart = new Date().setHours(0, 0, 0, 0);

        for (const req of requests) {
          const cost = req.response_cost_usd ?? 0;
          const inputT = req.prompt_tokens ?? 0;
          const outputT = req.completion_tokens ?? 0;
          const model = req.model ?? 'unknown';
          const latency = req.delay_ms ?? 0;
          const status = req.response_status ?? 200;
          const created = new Date(req.request_created_at ?? req.created_at ?? 0).getTime();
          const isError = status < 200 || status >= 300;

          const addToPeriod = (p: typeof periods['Today']) => {
            p.cost += cost;
            p.requests++;
            p.inputTokens += inputT;
            p.outputTokens += outputT;
            p.latencySum += latency;
            if (isError) p.errors++;
            if (!p.models[model]) p.models[model] = { cost: 0, requests: 0, inputTokens: 0, outputTokens: 0, latencySum: 0 };
            p.models[model].cost += cost;
            p.models[model].requests++;
            p.models[model].inputTokens += inputT;
            p.models[model].outputTokens += outputT;
            p.models[model].latencySum += latency;
          };

          if (created >= todayStart) addToPeriod(periods['Today']);
          if (now - created <= 7 * 86400000) addToPeriod(periods['7 days']);
          if (now - created <= 30 * 86400000) addToPeriod(periods['30 days']);
          addToPeriod(periods['90 days']);
        }

        // Format periods
        for (const [key, p] of Object.entries(periods)) {
          const formatted: Record<string, { cost: number; requests: number; inputTokens: number; outputTokens: number; avgLatency: number }> = {};
          for (const [m, s] of Object.entries(p.models)) {
            formatted[m] = { ...s, avgLatency: s.requests > 0 ? Math.round(s.latencySum / s.requests) : 0 };
          }
          (periods as Record<string, unknown>)[key] = {
            totalCost: Math.round(p.cost * 10000) / 10000,
            totalRequests: p.requests,
            totalInputTokens: p.inputTokens,
            totalOutputTokens: p.outputTokens,
            totalTokens: p.inputTokens + p.outputTokens,
            avgLatency: p.requests > 0 ? Math.round(p.latencySum / p.requests) : 0,
            avgCostPerRequest: p.requests > 0 ? Math.round((p.cost / p.requests) * 10000) / 10000 : 0,
            successRate: p.requests > 0 ? Math.round(((p.requests - p.errors) / p.requests) * 100) : 100,
            errorCount: p.errors,
            models: formatted,
          };
        }

        results.helicone = { status: 'connected', periods };
      } else {
        results.helicone = { status: 'error', message: `API returned ${res.status}` };
      }
    } else {
      results.helicone = { status: 'not_configured' };
    }
  } catch (e) {
    results.helicone = { status: 'error', message: String(e) };
  }

  // ── 2. Vercel ──
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    const vercelProject = process.env.VERCEL_PROJECT_ID;
    if (vercelToken && vercelProject) {
      // Get recent deployments count
      const deplRes = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${vercelProject}&limit=100`,
        { headers: { Authorization: `Bearer ${vercelToken}` } }
      );
      if (deplRes.ok) {
        const deplData = await deplRes.json();
        const deployments = deplData.deployments ?? [];
        const readyCount = deployments.filter((d: { state: string }) => d.state === 'READY').length;
        const errorCount = deployments.filter((d: { state: string }) => d.state === 'ERROR').length;
        results.vercel = {
          status: 'connected',
          plan: 'Pro',
          totalDeployments: deployments.length,
          successfulDeployments: readyCount,
          failedDeployments: errorCount,
          successRate: deployments.length > 0 ? Math.round((readyCount / deployments.length) * 100) : 100,
        };
      } else {
        results.vercel = { status: 'error' };
      }
    }
  } catch {
    results.vercel = { status: 'error' };
  }

  // ── 3. Supabase ──
  try {
    const supaPat = process.env.SUPABASE_PAT;
    const supaRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1];

    // Table row counts
    const countRes = await fetch(`https://api.supabase.com/v1/projects/${supaRef}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supaPat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: "SELECT schemaname, relname as table, n_live_tup as rows FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY n_live_tup DESC",
      }),
    });

    if (countRes.ok) {
      const tables = await countRes.json();
      const totalRows = tables.reduce((sum: number, t: { rows: number }) => sum + Number(t.rows), 0);

      // Get database size
      let dbSize = null;
      try {
        const sizeRes = await fetch(`https://api.supabase.com/v1/projects/${supaRef}/database/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supaPat}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: "SELECT pg_size_pretty(pg_database_size(current_database())) as db_size, pg_database_size(current_database()) as db_size_bytes" }),
        });
        if (sizeRes.ok) {
          const sizeData = await sizeRes.json();
          dbSize = sizeData[0] ?? null;
        }
      } catch { /* skip */ }

      // Get storage usage
      let storageInfo = null;
      try {
        const storageRes = await fetch(`https://api.supabase.com/v1/projects/${supaRef}/database/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supaPat}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: "SELECT count(*) as file_count, coalesce(sum((metadata->>'size')::bigint), 0) as total_bytes FROM storage.objects WHERE bucket_id = 'documents'" }),
        });
        if (storageRes.ok) {
          const storageData = await storageRes.json();
          storageInfo = storageData[0] ?? null;
        }
      } catch { /* skip */ }

      results.supabase = {
        status: 'connected',
        plan: 'Free',
        tables: tables.length,
        totalRows,
        tableBreakdown: tables,
        dbSize: dbSize?.db_size ?? null,
        dbSizeBytes: dbSize?.db_size_bytes ?? null,
        dbSizeLimit: '500 MB',
        storageFiles: storageInfo?.file_count ?? 0,
        storageBytes: storageInfo?.total_bytes ?? 0,
        storageLimit: '1 GB',
      };
    } else {
      results.supabase = { status: 'connected', plan: 'Free' };
    }
  } catch {
    results.supabase = { status: 'connected', plan: 'Free' };
  }

  // ── 4. Clerk ──
  try {
    const clerkKey = process.env.CLERK_SECRET_KEY;
    if (clerkKey) {
      const userRes = await fetch('https://api.clerk.com/v1/users?limit=1', {
        headers: { Authorization: `Bearer ${clerkKey}` },
      });
      if (userRes.ok) {
        const totalHeader = userRes.headers.get('x-total-count');
        results.clerk = {
          status: 'connected',
          plan: 'Free (dev)',
          totalUsers: totalHeader ? parseInt(totalHeader) : 1,
        };
      } else {
        results.clerk = { status: 'connected', plan: 'Free (dev)' };
      }
    }
  } catch {
    results.clerk = { status: 'connected', plan: 'Free (dev)' };
  }

  // ── 5. GitHub ──
  try {
    const ghToken = process.env.GITHUB_TOKEN;
    if (ghToken) {
      const repoRes = await fetch(`https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`, {
        headers: { Authorization: `Bearer ${ghToken}` },
      });
      if (repoRes.ok) {
        const repo = await repoRes.json();
        // Get recent commits
        const commitsRes = await fetch(`https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/commits?per_page=100`, {
          headers: { Authorization: `Bearer ${ghToken}` },
        });
        const commits = commitsRes.ok ? await commitsRes.json() : [];
        results.github = {
          status: 'connected',
          repo: repo.full_name,
          size: repo.size,
          commits: commits.length,
          defaultBranch: repo.default_branch,
        };
      }
    }
  } catch {
    results.github = { status: 'error' };
  }

  // ── 6. Anthropic balance (manual entry + Helicone spend since set_at) ──
  // Anthropic does not expose account balance via any public API. Users record
  // their current balance after topping up, and we subtract observed spend.
  try {
    const { data: billing } = await supabaseAdmin
      .from('billing_state')
      .select('starting_balance_usd, set_at, alert_threshold_usd')
      .eq('user_id', userId)
      .eq('provider', 'anthropic')
      .maybeSingle();

    if (billing) {
      const setAt = new Date(billing.set_at).getTime();
      const spentSince = heliconeRequests
        .filter(r => {
          const ts = new Date(r.request_created_at ?? r.created_at ?? 0).getTime();
          return ts >= setAt;
        })
        .reduce((sum, r) => sum + (r.response_cost_usd ?? 0), 0);

      const starting = Number(billing.starting_balance_usd);
      const threshold = Number(billing.alert_threshold_usd);
      const remaining = Math.max(0, starting - spentSince);

      results.anthropicBalance = {
        configured: true,
        startingBalance: starting,
        setAt: billing.set_at,
        spentSince: Math.round(spentSince * 10000) / 10000,
        remaining: Math.round(remaining * 10000) / 10000,
        alertThreshold: threshold,
        lowBalance: remaining < threshold,
      };
    } else {
      results.anthropicBalance = { configured: false };
    }
  } catch (e) {
    results.anthropicBalance = { configured: false, error: String(e) };
  }

  return Response.json(results, {
    headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=300' },
  });
}
