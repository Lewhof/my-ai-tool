import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('vault_keys')
    .select('id, name, service, masked_value, created_at, updated_at')
    .eq('user_id', userId)
    .order('service', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ keys: data });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { name, service, value } = await req.json();
  if (!name?.trim() || !value?.trim()) {
    return Response.json({ error: 'Name and value required' }, { status: 400 });
  }

  // Create masked version: show first 8 and last 4 chars
  const masked = value.length > 16
    ? value.slice(0, 8) + '...' + value.slice(-4)
    : '****';

  const { data, error } = await supabaseAdmin
    .from('vault_keys')
    .insert({
      user_id: userId,
      name,
      service: service || 'other',
      value,
      masked_value: masked,
    })
    .select('id, name, service, masked_value, created_at, updated_at')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
