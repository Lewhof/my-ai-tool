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
  // cached=true → return null when no plan exists, never trigger AI generation.
  // Used by Week view to fetch 7 days without spawning 7 parallel AI runs.
  const cachedOnly = url.searchParams.get('cached') === 'true';

  // Check for existing plan
  if (!forceRefresh) {
    const existing = await loadDailyPlan(userId, date);
    if (existing) {
      return Response.json({ plan: existing, source: 'cached' });
    }
  }

  if (cachedOnly) {
    return Response.json({ plan: null, source: 'cached' });
  }

  // Generate new plan via AI for the target date — gatherPlannerData uses
  // this both for fetching that date's calendar events AND for excluding
  // tasks already scheduled on other dates within ±30 days.
  const blocks = await generateDailyPlan(userId, date);

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
