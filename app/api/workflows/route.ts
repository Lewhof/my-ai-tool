import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('workflows')
    .select('id, name, description, steps, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ workflows: data });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { name, description, steps } = await req.json();
  if (!name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('workflows')
    .insert({ user_id: userId, name, description: description || null, steps: steps || [] })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
