import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET: List all contacts
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .order('last_interaction', { ascending: false, nullsFirst: false })
    .limit(100);

  return Response.json({ contacts: data ?? [] });
}

// POST: Create or update a contact (upsert by email)
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { name, email, company, tags, source } = await req.json();
  if (!email?.trim()) return Response.json({ error: 'Email required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .upsert({
      user_id: userId,
      name: name?.trim() || email.split('@')[0],
      email: email.trim().toLowerCase(),
      company: company || null,
      tags: tags || [],
      source: source || 'manual',
      last_interaction: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,email' })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ contact: data });
}

// PATCH: Update contact
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id, name, company, tags, notes, bump_interaction } = await req.json();
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (company !== undefined) updates.company = company;
  if (tags !== undefined) updates.tags = tags;
  if (notes !== undefined) updates.notes = notes;
  if (bump_interaction) updates.last_interaction = new Date().toISOString();

  await supabaseAdmin.from('contacts').update(updates).eq('id', id).eq('user_id', userId);
  return Response.json({ ok: true });
}

// DELETE: Remove contact
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await supabaseAdmin.from('contacts').delete().eq('id', id).eq('user_id', userId);
  return Response.json({ ok: true });
}
