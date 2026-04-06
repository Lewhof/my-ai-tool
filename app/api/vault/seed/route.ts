import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const SEED_KEYS = [
  { name: 'ANTHROPIC_API_KEY', service: 'Anthropic', category: 'API Key', value: process.env.ANTHROPIC_API_KEY },
  { name: 'HELICONE_API_KEY', service: 'Helicone', category: 'API Key', value: process.env.HELICONE_API_KEY },
  { name: 'CLERK_PUBLISHABLE_KEY', service: 'Clerk', category: 'API Key', value: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY },
  { name: 'CLERK_SECRET_KEY', service: 'Clerk', category: 'API Key', value: process.env.CLERK_SECRET_KEY },
  { name: 'TELEGRAM_BOT_TOKEN', service: 'Telegram', category: 'API Key', value: process.env.TELEGRAM_BOT_TOKEN },
  { name: 'GITHUB_TOKEN', service: 'GitHub', category: 'API Key', value: process.env.GITHUB_TOKEN },
  { name: 'SUPABASE_URL', service: 'Supabase', category: 'API Key', value: process.env.NEXT_PUBLIC_SUPABASE_URL },
  { name: 'SUPABASE_ANON_KEY', service: 'Supabase', category: 'API Key', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', service: 'Supabase', category: 'API Key', value: process.env.SUPABASE_SERVICE_ROLE_KEY },
  { name: 'VERCEL_TOKEN', service: 'Vercel', category: 'API Key', value: process.env.VERCEL_TOKEN },
  { name: 'VERCEL_PROJECT_ID', service: 'Vercel', category: 'Other', value: process.env.VERCEL_PROJECT_ID },
];

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Check if already seeded
  const { data: existing } = await supabaseAdmin
    .from('vault_keys')
    .select('name')
    .eq('user_id', userId);

  const existingNames = new Set((existing ?? []).map((k) => k.name));

  const toInsert = SEED_KEYS
    .filter((k) => k.value && !existingNames.has(k.name))
    .map((k) => {
      const val = k.value!;
      return {
        user_id: userId,
        name: k.name,
        service: k.service,
        category: k.category,
        value: val,
        masked_value: val.length > 16 ? val.slice(0, 8) + '...' + val.slice(-4) : '****',
      };
    });

  if (toInsert.length === 0) {
    return Response.json({ message: 'All keys already seeded', added: 0 });
  }

  const { error } = await supabaseAdmin.from('vault_keys').insert(toInsert);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ message: `Seeded ${toInsert.length} keys`, added: toInsert.length });
}
