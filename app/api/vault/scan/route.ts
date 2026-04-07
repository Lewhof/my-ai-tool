import { auth } from '@clerk/nextjs/server';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const category = formData.get('category') as string || '';

  if (!file) return Response.json({ error: 'No image provided' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: 'Gemini API not configured' }, { status: 500 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  const prompt = category
    ? `You are scanning an image to extract information for a "${category}" vault entry. Extract all relevant fields you can see. Return ONLY valid JSON with field keys and values. Common fields by category:
- bank_card: card_name, number, expiry, cvv, bank
- login: username, password, url
- wifi: network, password, security
- membership: organisation, member_number, expiry
- vehicle: vehicle_name, registration, vin
- subscription: service, username, password, plan, cost
- insurance: provider, policy_number, type, contact
- identity: id_number, passport, drivers
- property_access: property, gate_code
- property_utility: provider, account_number, meter_number
Extract what you can see. Return JSON only.`
    : `Analyze this image and determine what type of vault entry it represents (bank card, Wi-Fi password, membership card, identity document, etc). Extract all visible information. Return JSON with: {"suggested_category": "category_key", "name": "entry name", "fields": {"key": "value", ...}}`;

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
          generationConfig: { maxOutputTokens: 500 },
        }),
      }
    );

    if (!res.ok) {
      return Response.json({ error: `Gemini API error (${res.status})` }, { status: res.status });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Response.json(parsed);
    }

    return Response.json({ error: 'Could not extract data from image', raw: text }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Scan failed' }, { status: 500 });
  }
}
