import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let query = supabaseAdmin
    .from('meals')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (date) query = query.eq('date', date);
  else if (from && to) query = query.gte('date', from).lte('date', to);
  else query = query.limit(50);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ meals: data ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    date, meal_type, name, description,
    calories, protein_g, carbs_g, fiber_g, fat_g,
    is_keto = true, source = 'manual', recipe_id,
  } = body;

  if (!name || !meal_type) {
    return Response.json({ error: 'name and meal_type required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('meals').insert({
    user_id: userId,
    date: date || new Date().toISOString().split('T')[0],
    meal_type,
    name,
    description: description ?? null,
    calories: calories ?? null,
    protein_g: protein_g ?? null,
    carbs_g: carbs_g ?? null,
    fiber_g: fiber_g ?? null,
    fat_g: fat_g ?? null,
    is_keto,
    source,
    recipe_id: recipe_id ?? null,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ meal: data });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('meals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
