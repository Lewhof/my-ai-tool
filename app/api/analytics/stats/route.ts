import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET /api/analytics/stats?siteId=xxx
// Proxies to the configured provider (Plausible/Vercel/manual/…) and returns a
// normalized shape: { visitors: {today, 7d, 30d}, top_pages[], top_referrers[], bounce_rate }
//
// Providers:
//   - vercel:    uses VERCEL_TOKEN + project slug/ID; tries web-vitals → speed-insights path
//                NOTE: Vercel Analytics v2 has no public REST API yet. We return a placeholder
//                      with a clear message. Still marked "connected" so the card doesn't look broken.
//   - plausible: hits https://plausible.io/api/v1/stats/aggregate with site API key from vault
//   - ga4:       placeholder (requires OAuth service account flow)
//   - umami:     placeholder
//   - manual:    returns empty structure — user can wire later

type NormalizedStats = {
  provider: string;
  status: 'connected' | 'error' | 'placeholder' | 'not_configured';
  message?: string;
  visitors?: { today: number; last_7d: number; last_30d: number };
  pageviews?: { today: number; last_7d: number; last_30d: number };
  top_pages?: Array<{ path: string; visitors: number }>;
  top_referrers?: Array<{ source: string; visitors: number }>;
  bounce_rate?: number;
  live_url?: string;
};

async function fetchPlausible(domain: string, apiKey: string): Promise<NormalizedStats> {
  try {
    const base = 'https://plausible.io/api/v1/stats';
    const headers = { Authorization: `Bearer ${apiKey}` };
    const [today, d7, d30, topPages, topRefs] = await Promise.all([
      fetch(`${base}/aggregate?site_id=${encodeURIComponent(domain)}&period=day&metrics=visitors,pageviews,bounce_rate`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${base}/aggregate?site_id=${encodeURIComponent(domain)}&period=7d&metrics=visitors,pageviews`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${base}/aggregate?site_id=${encodeURIComponent(domain)}&period=30d&metrics=visitors,pageviews`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${base}/breakdown?site_id=${encodeURIComponent(domain)}&period=30d&property=event:page&limit=5`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${base}/breakdown?site_id=${encodeURIComponent(domain)}&period=30d&property=visit:source&limit=5`, { headers }).then((r) => r.ok ? r.json() : null),
    ]);

    return {
      provider: 'plausible',
      status: 'connected',
      visitors: {
        today: today?.results?.visitors?.value ?? 0,
        last_7d: d7?.results?.visitors?.value ?? 0,
        last_30d: d30?.results?.visitors?.value ?? 0,
      },
      pageviews: {
        today: today?.results?.pageviews?.value ?? 0,
        last_7d: d7?.results?.pageviews?.value ?? 0,
        last_30d: d30?.results?.pageviews?.value ?? 0,
      },
      bounce_rate: today?.results?.bounce_rate?.value ?? 0,
      top_pages: (topPages?.results ?? []).map((r: { page: string; visitors: number }) => ({ path: r.page, visitors: r.visitors })),
      top_referrers: (topRefs?.results ?? []).map((r: { source: string; visitors: number }) => ({ source: r.source, visitors: r.visitors })),
      live_url: `https://plausible.io/${domain}`,
    };
  } catch (e) {
    return { provider: 'plausible', status: 'error', message: String(e) };
  }
}

async function fetchVercelAnalytics(projectId: string): Promise<NormalizedStats> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return { provider: 'vercel', status: 'not_configured', message: 'VERCEL_TOKEN missing' };
  }
  // Vercel Analytics/Speed Insights do NOT expose a public REST API at the time of build.
  // We verify the project exists and return a placeholder with a deep link.
  try {
    const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { provider: 'vercel', status: 'error', message: `Project lookup failed (${res.status})` };
    }
    const proj = await res.json();
    return {
      provider: 'vercel',
      status: 'placeholder',
      message: 'Vercel Analytics has no public REST API yet — viewing requires dashboard',
      live_url: `https://vercel.com/${proj.accountId || ''}/${proj.name}/analytics`,
    };
  } catch (e) {
    return { provider: 'vercel', status: 'error', message: String(e) };
  }
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const siteId = url.searchParams.get('siteId');
  if (!siteId) return Response.json({ error: 'siteId required' }, { status: 400 });

  // Load site row
  const { data: site, error } = await supabaseAdmin
    .from('analytics_sites')
    .select('*')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single();

  if (error || !site) return Response.json({ error: 'Site not found' }, { status: 404 });

  // If user stored a Plausible API key in vault_keys, look it up
  let apiKey: string | null = null;
  if (site.api_key_vault_ref) {
    const { data: vaultRow } = await supabaseAdmin
      .from('vault_keys')
      .select('value, fields')
      .eq('id', site.api_key_vault_ref)
      .eq('user_id', userId)
      .maybeSingle();
    if (vaultRow) {
      apiKey = vaultRow.value ?? null;
      if (!apiKey && vaultRow.fields && typeof vaultRow.fields === 'object') {
        apiKey = (vaultRow.fields as { value?: string }).value ?? null;
      }
    }
  }

  let stats: NormalizedStats;
  if (site.provider === 'plausible') {
    if (!apiKey) {
      stats = { provider: 'plausible', status: 'not_configured', message: 'Add Plausible API key in Vault and link via api_key_vault_ref' };
    } else {
      let domain = site.provider_site_id;
      if (!domain) {
        try { domain = new URL(site.url).hostname; } catch { domain = site.url; }
      }
      stats = await fetchPlausible(domain, apiKey);
    }
  } else if (site.provider === 'vercel') {
    stats = await fetchVercelAnalytics(site.provider_site_id || process.env.VERCEL_PROJECT_ID || '');
  } else if (site.provider === 'ga4') {
    stats = { provider: 'ga4', status: 'placeholder', message: 'GA4 integration requires service account — placeholder only' };
  } else if (site.provider === 'umami') {
    stats = { provider: 'umami', status: 'placeholder', message: 'Umami integration coming soon' };
  } else {
    stats = { provider: 'manual', status: 'placeholder', message: 'Manual entry — no stats fetched' };
  }

  return Response.json({ site, stats });
}
