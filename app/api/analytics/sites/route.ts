import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// CRUD for analytics_sites.
// Never stores API keys directly — only vault references.

const ALLOWED_PROVIDERS = ['plausible', 'vercel', 'ga4', 'umami', 'manual'];

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('analytics_sites')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sites: data ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  let body: { label?: string; url?: string; provider?: string; provider_site_id?: string; api_key_vault_ref?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { label, url, provider, provider_site_id, api_key_vault_ref } = body;
  if (!label || !url || !provider) {
    return Response.json({ error: 'label, url, provider required' }, { status: 400 });
  }
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return Response.json({ error: `provider must be one of ${ALLOWED_PROVIDERS.join(', ')}` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('analytics_sites')
    .insert({
      user_id: userId,
      label,
      url,
      provider,
      provider_site_id: provider_site_id || null,
      api_key_vault_ref: api_key_vault_ref || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ site: data });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  let body: { id?: string; label?: string; url?: string; provider?: string; provider_site_id?: string; is_active?: boolean };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { id, ...updates } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  if (updates.provider && !ALLOWED_PROVIDERS.includes(updates.provider)) {
    return Response.json({ error: `provider must be one of ${ALLOWED_PROVIDERS.join(', ')}` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('analytics_sites')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ site: data });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  let body: { id?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('analytics_sites')
    .delete()
    .eq('id', body.id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
