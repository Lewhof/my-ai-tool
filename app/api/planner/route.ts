import { auth } from '@clerk/nextjs/server';
import { generateDailyPlan, saveDailyPlan, loadDailyPlan } from '@/lib/planner';
import type { PlanBlock } from '@/lib/planner';

// GET: Load today's plan (or generate a new one)
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  // Check for existing plan
  if (!forceRefresh) {
    const existing = await loadDailyPlan(userId, date);
    if (existing) {
      return Response.json({ plan: existing, source: 'cached' });
    }
  }

  // Generate new plan via AI
  const blocks = await generateDailyPlan(userId);

  // Save the generated plan
  const plan = await saveDailyPlan(userId, date, blocks, false);

  return Response.json({
    plan: {
      id: plan.id,
      plan_date: date,
      blocks,
      locked: false,
      created_at: plan.created_at,
    },
    source: 'generated',
  });
}

// POST: Save/update plan (reorder blocks, lock day)
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { date, blocks, locked } = await req.json() as {
    date: string;
    blocks: PlanBlock[];
    locked: boolean;
  };

  if (!date || !blocks) {
    return Response.json({ error: 'date and blocks required' }, { status: 400 });
  }

  const plan = await saveDailyPlan(userId, date, blocks, locked ?? false);

  return Response.json({ plan, ok: true });
}
