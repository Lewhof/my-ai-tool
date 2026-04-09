import { auth } from '@clerk/nextjs/server';
import { generateWithFallback } from '@/lib/image-providers';
import type { ImageSize } from '@/lib/image-providers';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { prompt, provider, size } = await req.json() as {
    prompt?: string;
    provider?: string; // optional — specific provider id, or 'auto'
    size?: ImageSize;
  };

  if (!prompt?.trim()) return Response.json({ error: 'Prompt required' }, { status: 400 });

  const isAuto = !provider || provider === 'auto';
  const { finalResult, attempts } = await generateWithFallback(
    { prompt, size: size || 'square' },
    isAuto ? undefined : provider
  );

  if (!finalResult.success) {
    return Response.json(
      {
        error: finalResult.error,
        errorType: finalResult.errorType,
        attempts,
      },
      { status: 500 }
    );
  }

  return Response.json({
    image: finalResult.image,
    text: finalResult.text,
    provider: attempts[attempts.length - 1]?.provider,
    attempts,
  });
}
