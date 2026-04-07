import { auth } from '@clerk/nextjs/server';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const prompt = formData.get('prompt') as string || 'Analyze this image in detail. Describe what you see.';

  if (!file) return Response.json({ error: 'No image provided' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: 'Gemini API not configured' }, { status: 500 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: file.type, data: base64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { maxOutputTokens: 1000 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Gemini error (${res.status}): ${err.slice(0, 100)}` }, { status: res.status });
    }

    const data = await res.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis available.';

    return Response.json({ analysis });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Vision failed' }, { status: 500 });
  }
}
