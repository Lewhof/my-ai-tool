import { auth } from '@clerk/nextjs/server';
import { getCacheStats, purgeExpired } from '@/lib/ai-cache';

// GET: Cache statistics per scope — use to measure whether Phase 4.2 Tier 1 is paying off
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const stats = await getCacheStats();
  return Response.json({ stats, measured_at: new Date().toISOString() });
}

// POST: Purge expired entries — safe to call from cron or manually
export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const purged = await purgeExpired();
  return Response.json({ purged });
}
