import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';

const VALID_CATEGORIES = [
  'Housing', 'Transport', 'Food', 'Entertainment',
  'Subscriptions', 'Business', 'Health', 'Education', 'Other',
];

interface ParsedReceipt {
  amount: number | null;
  category: string;
  description: string;
  entry_date: string | null;
  type: 'expense' | 'income';
  vendor: string | null;
  raw_text: string;
  confidence: 'high' | 'medium' | 'low';
}

// POST: Parse a receipt image and return structured finance entry data
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { image } = await req.json() as { image?: string };
  if (!image) return Response.json({ error: 'image required (base64 data URL)' }, { status: 400 });

  // Strip data URL prefix to get raw base64
  const match = image.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return Response.json({ error: 'invalid image format' }, { status: 400 });

  const mediaType = `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}` as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const base64Data = match[2];

  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
    return Response.json({ error: 'unsupported image type' }, { status: 400 });
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: `Extract finance transaction data from this receipt image. Today is ${today}.

Categories: ${VALID_CATEGORIES.join(', ')}

Category guidance:
- Food: groceries, restaurants, takeaways, coffee
- Transport: fuel, Uber, parking, taxi, public transport
- Subscriptions: Netflix, Spotify, software, gym memberships
- Health: pharmacy, doctor, medical aid
- Entertainment: cinema, events, hobbies, gaming
- Business: office supplies, B2B services, professional fees
- Housing: rent, utilities, maintenance, hardware store
- Education: courses, books, training
- Other: anything that doesn't clearly fit

Return ONLY valid JSON with this structure:
{
  "amount": 123.45,
  "category": "Food",
  "description": "Brief description: vendor + key items (max 80 chars)",
  "entry_date": "YYYY-MM-DD",
  "type": "expense",
  "vendor": "Vendor name if visible",
  "raw_text": "All text you can read from the receipt",
  "confidence": "high|medium|low"
}

Rules:
- amount: total/grand total in the receipt's currency. Numbers only, no symbols.
- entry_date: from the receipt date. Format YYYY-MM-DD. If not visible, use ${today}.
- type: "expense" unless it's clearly an income/refund/credit.
- description: vendor name + 1-2 key items (e.g. "Checkers - groceries" or "Sasol - fuel + snack")
- confidence: "high" if all fields read clearly; "medium" if some are guessed; "low" if image is unclear.
- If amount cannot be determined, return amount: null with confidence: "low".

Return ONLY the JSON object, no commentary.`,
          },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: 'Could not parse receipt — try a clearer photo' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as ParsedReceipt;

    // Validate + sanitize
    const result = {
      amount: parsed.amount !== null && !isNaN(Number(parsed.amount)) ? Number(parsed.amount) : null,
      category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'Other',
      description: (parsed.description || parsed.vendor || '').slice(0, 200),
      entry_date: parsed.entry_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.entry_date) ? parsed.entry_date : today,
      type: parsed.type === 'income' ? 'income' : 'expense',
      vendor: parsed.vendor || null,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    };

    return Response.json({ parsed: result });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : 'Vision parsing failed',
    }, { status: 500 });
  }
}
