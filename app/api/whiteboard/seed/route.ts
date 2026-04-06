import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const SEED_ITEMS = [
  {
    title: 'Upgrade web chat to support code editing',
    description: 'Wire the app\'s Chat page to work like the Telegram bot — user sends instructions via web chat, Claude reads files from GitHub, generates changes, writes them back, and triggers a deploy. Essentially Claude Code in the browser.\n\nScope:\n- Add a "Dev Mode" toggle to the chat UI\n- In dev mode, use Sonnet instead of Haiku\n- Read current app files from GitHub as context\n- Parse Claude\'s response for file changes (XML tags like Telegram bot)\n- Write changes back to GitHub via API\n- Show deploy status in chat\n- Keep normal chat mode for general questions',
    status: 'idea',
    priority: 1,
    tags: ['feature', 'chat', 'agent'],
  },
  {
    title: 'Unified AI Credits Dashboard — Multi-provider usage tracking',
    description: 'Build a provider plugin system for the AI Credits widget that pulls usage/cost data from all AI services.\n\nArchitecture:\n- Each provider = a small adapter file in lib/providers/ (endpoint URL, auth format, response parser)\n- Vault stores API keys per provider — credits endpoint reads from Vault\n- Normalized response: { provider, totalCost, totalRequests, totalTokens, models[], period }\n- Dashboard widget shows combined spend across all providers + per-provider breakdown\n\nProviders to support:\n1. Anthropic (via Helicone) — already done\n2. OpenAI — api.openai.com/v1/usage (cost, tokens by model)\n3. Google AI (Gemini) — Cloud Billing API\n4. Mistral — api.mistral.ai/v1/usage\n5. Groq — dashboard API (requests, tokens)\n6. Replicate — api.replicate.com/v1/predictions (cost per prediction)\n7. ElevenLabs — api.elevenlabs.io/v1/user (character quota)\n8. Stability AI — api.stability.ai/v1/user/balance (credits remaining)\n9. Vercel — usage API (already partially done)\n10. Supabase — management API (DB size, bandwidth, storage)\n\nApproach: Option A first (add manually as needed), refactor to Option B (plugin system) when 3+ providers are active.\n\nUI enhancements:\n- Total monthly spend across all providers\n- Sparkline/trend chart per provider\n- Budget alerts (set monthly cap, warn at 80%)\n- Cost comparison between models across providers',
    status: 'idea',
    priority: 2,
    tags: ['feature', 'dashboard', 'credits', 'multi-provider'],
  },
];

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Check existing to avoid duplicates
  const { data: existing } = await supabaseAdmin
    .from('whiteboard')
    .select('title')
    .eq('user_id', userId);

  const existingTitles = new Set((existing ?? []).map((i) => i.title));

  const toInsert = SEED_ITEMS
    .filter((item) => !existingTitles.has(item.title))
    .map((item) => ({ ...item, user_id: userId }));

  if (toInsert.length === 0) {
    return Response.json({ message: 'All items already exist', added: 0 });
  }

  const { error } = await supabaseAdmin.from('whiteboard').insert(toInsert);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ added: toInsert.length });
}
