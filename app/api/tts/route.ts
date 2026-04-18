import { auth } from '@clerk/nextjs/server';
import { generateTTS, listVoices, getCurrentProvider } from '@/lib/tts';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const provider = getCurrentProvider();
  return Response.json({ provider, voices: listVoices(provider) });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = (body.text as string)?.trim();
  const voice = body.voice as string | undefined;

  if (!text) return Response.json({ error: 'text required' }, { status: 400 });
  if (text.length > 50000) return Response.json({ error: 'text too long (max 50k chars)' }, { status: 400 });

  try {
    const result = await generateTTS(userId, text, voice);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
