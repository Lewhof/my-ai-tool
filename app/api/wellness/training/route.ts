import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('training_activities')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(50);

  if (error) {
    // Table might not exist yet — return empty
    return Response.json({ activities: [] });
  }

  return Response.json({ activities: data ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { type, name, duration_min, intensity, notes, date } = body;

  if (!name || !duration_min) {
    return Response.json({ error: 'Name and duration required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('training_activities')
    .insert({
      user_id: userId,
      type: type || 'other',
      name,
      duration_min: parseInt(duration_min),
      intensity: intensity || 'medium',
      notes: notes || '',
      date: date || new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ activity: data });
}
