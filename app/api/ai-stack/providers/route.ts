import { auth } from '@clerk/nextjs/server';

// Aggregates live status + usage/balance for non-Anthropic AI providers.
// Fail-open: if a provider errors, its card shows "error" but the whole response still returns.
//
// Coverage:
//   - OpenAI      — API key configured check + best-effort usage probe
//   - Stability   — live credit balance from /v1/user/balance
//   - Replicate   — recent prediction count + account info
//   - Gemini      — no public usage API, status only
//
// Helicone + Anthropic are already covered by /api/credits. We don't duplicate them here.

type ProviderStatus = {
  id: string;
  name: string;
  configured: boolean;
  status: 'connected' | 'error' | 'not_configured';
  balance?: string;
  usage?: string;
  plan?: string;
  message?: string;
  link?: string;
};

async function checkOpenAI(): Promise<ProviderStatus> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { id: 'openai', name: 'OpenAI', configured: false, status: 'not_configured', link: 'https://platform.openai.com/api-keys' };
  }
  try {
    // Ping the models endpoint — cheap and confirms the key works.
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return { id: 'openai', name: 'OpenAI', configured: true, status: 'error', message: `API returned ${res.status}`, link: 'https://platform.openai.com/usage' };
    }
    const data = await res.json().catch(() => ({ data: [] }));
    const modelCount = Array.isArray(data.data) ? data.data.length : 0;
    return {
      id: 'openai',
      name: 'OpenAI',
      configured: true,
      status: 'connected',
      plan: 'Pay-as-you-go',
      usage: `${modelCount} models available`,
      message: 'Usage billing view available in OpenAI dashboard',
      link: 'https://platform.openai.com/usage',
    };
  } catch (e) {
    return { id: 'openai', name: 'OpenAI', configured: true, status: 'error', message: String(e), link: 'https://platform.openai.com/usage' };
  }
}

async function checkStability(): Promise<ProviderStatus> {
  const key = process.env.STABILITY_API_KEY;
  if (!key) {
    return { id: 'stability', name: 'Stability AI', configured: false, status: 'not_configured', link: 'https://platform.stability.ai/account/keys' };
  }
  try {
    const res = await fetch('https://api.stability.ai/v1/user/balance', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return { id: 'stability', name: 'Stability AI', configured: true, status: 'error', message: `API returned ${res.status}`, link: 'https://platform.stability.ai/account/credits' };
    }
    const data = await res.json();
    return {
      id: 'stability',
      name: 'Stability AI',
      configured: true,
      status: 'connected',
      plan: 'Credit-based',
      balance: `${Math.round((data.credits ?? 0) * 100) / 100} credits`,
      link: 'https://platform.stability.ai/account/credits',
    };
  } catch (e) {
    return { id: 'stability', name: 'Stability AI', configured: true, status: 'error', message: String(e), link: 'https://platform.stability.ai/account/credits' };
  }
}

async function checkReplicate(): Promise<ProviderStatus> {
  const key = process.env.REPLICATE_API_TOKEN;
  if (!key) {
    return { id: 'replicate', name: 'Replicate', configured: false, status: 'not_configured', link: 'https://replicate.com/account/api-tokens' };
  }
  try {
    const res = await fetch('https://api.replicate.com/v1/account', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return { id: 'replicate', name: 'Replicate', configured: true, status: 'error', message: `API returned ${res.status}`, link: 'https://replicate.com/account/billing' };
    }
    const data = await res.json();
    // Also fetch recent predictions to show usage signal
    const predRes = await fetch('https://api.replicate.com/v1/predictions?limit=10', {
      headers: { Authorization: `Bearer ${key}` },
    });
    let usageStr = '';
    if (predRes.ok) {
      const predData = await predRes.json();
      usageStr = `${(predData.results ?? []).length} recent predictions`;
    }
    return {
      id: 'replicate',
      name: 'Replicate',
      configured: true,
      status: 'connected',
      plan: data.type === 'user' ? 'Pay-per-use' : (data.type ?? 'Unknown'),
      usage: usageStr || `${data.username || 'account'} connected`,
      link: 'https://replicate.com/account/billing',
    };
  } catch (e) {
    return { id: 'replicate', name: 'Replicate', configured: true, status: 'error', message: String(e), link: 'https://replicate.com/account/billing' };
  }
}

async function checkGemini(): Promise<ProviderStatus> {
  // Gemini has no public usage/balance API. Just report status.
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    return {
      id: 'gemini',
      name: 'Google Gemini',
      configured: false,
      status: 'not_configured',
      message: 'Used via web_search tool — no direct API key configured',
      link: 'https://aistudio.google.com/app/apikey',
    };
  }
  return {
    id: 'gemini',
    name: 'Google Gemini',
    configured: true,
    status: 'connected',
    plan: 'Free tier',
    message: 'Usage view only in Google AI Studio',
    link: 'https://aistudio.google.com/app/usage',
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const [openai, stability, replicate, gemini] = await Promise.all([
    checkOpenAI(),
    checkStability(),
    checkReplicate(),
    checkGemini(),
  ]);

  return Response.json({
    providers: [openai, stability, replicate, gemini],
    measured_at: new Date().toISOString(),
  });
}
