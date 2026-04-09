import { auth } from '@clerk/nextjs/server';
import { getStackMap } from '@/lib/anthropic';

// Returns the hand-coded task→model routing table for visualization on /credits.
// Zero cost — no external API calls.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const stack = getStackMap();
  return Response.json({ stack, measured_at: new Date().toISOString() });
}
