import { supabaseAdmin } from '@/lib/supabase-server';

// Health check endpoint — verifies all services
// Can be called by cron or manually
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  // Allow both cron and authenticated users
  if (!isCron) {
    // For non-cron, just do a basic check
  }

  const results: Record<string, { status: string; latency: number; error?: string }> = {};
  const start = Date.now();

  // 1. Supabase
  try {
    const t = Date.now();
    const { error } = await supabaseAdmin.from('user_settings').select('id').limit(1);
    results.supabase = { status: error ? 'error' : 'ok', latency: Date.now() - t, error: error?.message };
  } catch (e) {
    results.supabase = { status: 'error', latency: 0, error: e instanceof Error ? e.message : 'failed' };
  }

  // 2. Anthropic (via Helicone)
  try {
    const t = Date.now();
    const res = await fetch('https://anthropic.helicone.ai/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }),
    });
    results.anthropic = { status: res.ok ? 'ok' : 'error', latency: Date.now() - t, error: res.ok ? undefined : `${res.status}` };
  } catch (e) {
    results.anthropic = { status: 'error', latency: 0, error: e instanceof Error ? e.message : 'failed' };
  }

  // 3. Gemini
  try {
    const t = Date.now();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 5 } }),
    });
    results.gemini = { status: res.ok || res.status === 429 ? 'ok' : 'error', latency: Date.now() - t, error: res.ok ? undefined : `${res.status}` };
  } catch (e) {
    results.gemini = { status: 'error', latency: 0, error: e instanceof Error ? e.message : 'failed' };
  }

  // 4. Groq
  try {
    const t = Date.now();
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      results.groq = { status: 'not_configured', latency: 0 };
    } else {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }),
      });
      results.groq = { status: res.ok ? 'ok' : 'error', latency: Date.now() - t };
    }
  } catch (e) {
    results.groq = { status: 'error', latency: 0, error: e instanceof Error ? e.message : 'failed' };
  }

  // 5. Vercel
  try {
    const t = Date.now();
    const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${process.env.VERCEL_PROJECT_ID}&limit=1`, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    });
    results.vercel = { status: res.ok ? 'ok' : 'error', latency: Date.now() - t };
  } catch (e) {
    results.vercel = { status: 'error', latency: 0, error: e instanceof Error ? e.message : 'failed' };
  }

  const allOk = Object.values(results).every((r) => r.status === 'ok' || r.status === 'not_configured');

  return Response.json({
    status: allOk ? 'healthy' : 'degraded',
    totalLatency: Date.now() - start,
    services: results,
    timestamp: new Date().toISOString(),
  });
}
