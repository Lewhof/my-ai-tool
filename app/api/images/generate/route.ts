import { auth } from '@clerk/nextjs/server';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { prompt } = await req.json();
  if (!prompt?.trim()) return Response.json({ error: 'Prompt required' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: 'Gemini API key not configured' }, { status: 500 });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Gemini error ${res.status}: ${err.slice(0, 200)}` }, { status: res.status });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];

    let text = '';
    let imageData = '';
    let mimeType = '';

    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.inlineData) {
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'image/png';
      }
    }

    return Response.json({
      text,
      image: imageData ? `data:${mimeType};base64,${imageData}` : null,
      mimeType,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Generation failed' }, { status: 500 });
  }
}
