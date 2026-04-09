import { auth } from '@clerk/nextjs/server';
import { getProviderStatus } from '@/lib/image-providers';

// GET: Returns which image providers are configured
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  return Response.json({ providers: getProviderStatus() });
}
