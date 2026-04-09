import { auth } from '@clerk/nextjs/server';
import { generateWithFallback } from '@/lib/image-providers';
import type { ImageSize } from '@/lib/image-providers';
import { supabaseAdmin } from '@/lib/supabase-server';

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

  const usedProvider = attempts[attempts.length - 1]?.provider;
  let persistedUrl = finalResult.image;

  // Persist the image to Storage + DB so it shows in the gallery
  if (finalResult.image) {
    try {
      const buffer = await imageToBuffer(finalResult.image);
      if (buffer) {
        const fileName = `${userId}/lab-${Date.now()}.png`;
        const { error: uploadErr } = await supabaseAdmin.storage
          .from('notes')
          .upload(fileName, buffer.data, { contentType: buffer.mimeType });

        if (!uploadErr) {
          const { data: signed } = await supabaseAdmin.storage
            .from('notes')
            .createSignedUrl(fileName, 31536000);
          if (signed?.signedUrl) persistedUrl = signed.signedUrl;

          await supabaseAdmin.from('generated_images').insert({
            user_id: userId,
            prompt,
            storage_path: fileName,
            provider: usedProvider,
            source: 'image_lab',
          });
        }
      }
    } catch {
      // Persistence failure should not break the generate response
    }
  }

  return Response.json({
    image: persistedUrl,
    text: finalResult.text,
    provider: usedProvider,
    attempts,
  });
}

// Convert a data URL or https URL into a Buffer + mime type for Supabase Storage.
async function imageToBuffer(src: string): Promise<{ data: Buffer; mimeType: string } | null> {
  if (src.startsWith('data:')) {
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { data: Buffer.from(match[2], 'base64'), mimeType: match[1] };
  }
  if (src.startsWith('http://') || src.startsWith('https://')) {
    const res = await fetch(src);
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type') || 'image/png';
    const arrayBuf = await res.arrayBuffer();
    return { data: Buffer.from(arrayBuf), mimeType };
  }
  return null;
}
