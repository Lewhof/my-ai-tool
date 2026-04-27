import { auth } from '@clerk/nextjs/server';
import { fetchFitnessSessions } from '@/lib/lhfitness-bridge';

// Read-only adapter that exposes LH Fitness scheduled sessions to any
// dashboard surface that needs them on their own (without going through the
// unified calendar aggregator). The aggregator already calls the same helper.

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setHours(0, 0, 0, 0);
  const defaultTo = new Date(now); defaultTo.setDate(defaultTo.getDate() + 14); defaultTo.setHours(23, 59, 59, 999);

  const fromIso = fromParam || defaultFrom.toISOString();
  const toIso = toParam || defaultTo.toISOString();

  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const MAX_RANGE_MS = 400 * 24 * 60 * 60 * 1000; // ~13 months
  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    toMs < fromMs ||
    toMs - fromMs > MAX_RANGE_MS
  ) {
    return Response.json({ error: 'invalid from/to (max range 400 days)' }, { status: 400 });
  }

  const events = await fetchFitnessSessions(userId, fromIso, toIso);
  return Response.json({ events }, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  });
}
