import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getDailyContent } from '@/lib/practice';

// GET: Today's daily practice content (morning + evening)
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const content = await getDailyContent(userId, date);
  return Response.json({ date, ...content });
}

// POST: Save morning or evening response
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { date, type, response } = await req.json() as {
    date: string;
    type: 'morning' | 'evening';
    response: {
      reflection?: string;
      mood?: number;
      energy?: number;
      gratitude?: string[];
      wentWell?: string;
      fellShort?: string;
      tomorrow?: string;
    };
  };

  if (!date || !type) {
    return Response.json({ error: 'date and type required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();
  if (type === 'morning') {
    updates.morning_response = response;
    updates.morning_completed_at = now;
  } else {
    updates.evening_response = response;
    updates.evening_completed_at = now;
  }

  const { error } = await supabaseAdmin
    .from('practice_daily')
    .update(updates)
    .eq('user_id', userId)
    .eq('date', date);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
