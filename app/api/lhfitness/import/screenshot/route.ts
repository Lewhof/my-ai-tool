// Vision OCR for Garmin (or any fitness app) screenshots → ImportedWorkout[].
// Uses Claude Haiku for cost; one screenshot can contain multiple activities.
// Output is a structured tool_use call so we always get clean JSON.

import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';

const SYSTEM = `You are extracting structured workout data from a fitness app screenshot (typically Garmin Connect, but also Strava, Apple Fitness, Polar, etc.).

Rules:
- Extract every distinct activity visible. A single screenshot may show one activity in detail, or a list of multiple activities.
- DATE HANDLING (CRITICAL):
  · The user's message will provide CURRENT DATE and may also provide a USER-STATED DATE for this upload.
  · If the screenshot shows an explicit absolute date (e.g. "April 24, 2026") → use it. Set date_confidence: "high".
  · If the screenshot shows a relative date ("Yesterday", "2 hr ago", "3 days ago") → compute from CURRENT DATE. Set date_confidence: "medium".
  · If the screenshot shows a partial date with no year ("Apr 24") → assume the most recent occurrence in the past relative to CURRENT DATE. Set date_confidence: "medium".
  · If you CANNOT determine the date from the image AND a USER-STATED DATE was provided → use the user-stated date at 12:00:00. Set date_confidence: "user_provided".
  · If you cannot determine the date AND no USER-STATED DATE → use today's CURRENT DATE as a placeholder. Set date_confidence: "low".
  · NEVER fabricate years or guess at a date. Be honest with confidence levels.
- Use ISO YYYY-MM-DDTHH:MM:SS format for the date field.
- ALWAYS return units as you see them in the source (km/mi, kcal/kJ, m/ft).
- For type, normalise to common categories: "Running", "Cycling", "Strength Training", "Walking", "Hiking", "Swimming", "Yoga", "HIIT", "Rowing", "Other".
- If a non-date field isn't shown or you can't read it confidently, leave it null. Don't invent.
- The overall confidence field reflects how confidently you read the core data (type, duration, distance) — date confidence is tracked separately.
- Return all extracted activities via the emit_activities tool.`;

const TOOL = {
  name: 'emit_activities',
  description: 'Emit the structured activities visible in the screenshot.',
  input_schema: {
    type: 'object' as const,
    properties: {
      activities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO datetime' },
            type: { type: 'string' },
            name: { type: 'string', description: 'Activity title if shown (e.g. "Morning Run", "Push Day")' },
            duration_seconds: { type: 'number' },
            distance: { type: 'number', description: 'Numeric distance value' },
            distance_unit: { type: 'string', enum: ['km', 'mi', 'm'], description: 'Unit as displayed' },
            calories: { type: 'number' },
            avg_hr: { type: 'number' },
            max_hr: { type: 'number' },
            elevation: { type: 'number' },
            elevation_unit: { type: 'string', enum: ['m', 'ft'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Your confidence in the core data extraction (type, duration, distance) for this activity' },
            date_confidence: { type: 'string', enum: ['high', 'medium', 'user_provided', 'low'], description: 'How you determined the date. high = explicit absolute date in screenshot. medium = relative date computed from CURRENT DATE. user_provided = used the USER-STATED DATE because image was ambiguous. low = could not determine, used placeholder.' },
            notes: { type: 'string', description: 'Anything notable but not categorised' },
          },
          required: ['date', 'type', 'confidence', 'date_confidence'],
        },
      },
    },
    required: ['activities'],
  },
};

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return Response.json({ error: 'Image too large (8MB max)' }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return Response.json({ error: `Unsupported image type: ${file.type}` }, { status: 400 });
    }

    // Client passes today's date (local timezone) for anchoring relative dates,
    // and optionally a user-stated date to use when the screenshot is ambiguous.
    // Without these the model has no reference point and "Yesterday"/"2hr ago"
    // labels get mis-dated wildly.
    const clientNow = (formData.get('now') as string) || '';
    const todayISO = (clientNow.match(/^\d{4}-\d{2}-\d{2}/) ? clientNow.slice(0, 10) : new Date().toISOString().slice(0, 10));
    const userStated = (formData.get('default_date') as string) || '';
    const userStatedISO = userStated.match(/^\d{4}-\d{2}-\d{2}$/) ? userStated : null;

    const dateAnchorText = userStatedISO
      ? `CURRENT DATE: ${todayISO}\nUSER-STATED DATE for this upload: ${userStatedISO} (use this if the image's own date is unclear/missing).`
      : `CURRENT DATE: ${todayISO} (use this to compute "Yesterday", "2h ago", and partial dates with no year). No USER-STATED DATE was provided — set date_confidence: "low" if you cannot determine the date.`;

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    type CreateParams = Parameters<typeof anthropic.messages.create>[0];
    const params: CreateParams = {
      model: MODELS.fast,           // Haiku is fine for digital screenshots
      max_tokens: 2048,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: dateAnchorText },
            { type: 'image', source: { type: 'base64', media_type: file.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: base64 } },
            { type: 'text', text: 'Extract every workout activity visible. Use the emit_activities tool. Be precise about date_confidence.' },
          ],
        },
      ],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'emit_activities' },
    };

    const completion = await anthropic.messages.create(params) as Awaited<ReturnType<typeof anthropic.messages.create>> & { content: Array<{ type: string; input?: unknown }> };
    const toolBlock = completion.content.find((c: { type: string }) => c.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return Response.json({ error: 'No structured output from vision model' }, { status: 500 });
    }

    const input = toolBlock.input as {
      activities: Array<{
        date: string;
        type: string;
        name?: string;
        duration_seconds?: number;
        distance?: number;
        distance_unit?: 'km' | 'mi' | 'm';
        calories?: number;
        avg_hr?: number;
        max_hr?: number;
        elevation?: number;
        elevation_unit?: 'm' | 'ft';
        confidence: 'high' | 'medium' | 'low';
        date_confidence?: 'high' | 'medium' | 'user_provided' | 'low';
        notes?: string;
      }>;
    };

    const importedAt = new Date().toISOString();
    const workouts = input.activities.map((a, i) => {
      // Normalise distance to km
      let distance_km: number | undefined;
      if (a.distance !== undefined) {
        if (a.distance_unit === 'mi') distance_km = a.distance * 1.60934;
        else if (a.distance_unit === 'm') distance_km = a.distance / 1000;
        else distance_km = a.distance;
      }
      let elevation_m: number | undefined;
      if (a.elevation !== undefined) {
        elevation_m = a.elevation_unit === 'ft' ? a.elevation * 0.3048 : a.elevation;
      }

      // Sanity clamp: if the date came back as something absurd (>1y in future or
      // >3y in past), override with the user-stated date or today's date and flag
      // date_confidence as low — protects against hallucinated years.
      let finalDate = a.date;
      let finalDateConfidence = a.date_confidence ?? 'low';
      try {
        const parsed = new Date(a.date);
        const todayMs = new Date(todayISO + 'T12:00:00Z').getTime();
        const driftDays = (parsed.getTime() - todayMs) / 86400000;
        if (isNaN(parsed.getTime()) || driftDays > 365 || driftDays < -3 * 365) {
          finalDate = (userStatedISO ?? todayISO) + 'T12:00:00.000Z';
          finalDateConfidence = userStatedISO ? 'user_provided' : 'low';
        }
      } catch {
        finalDate = (userStatedISO ?? todayISO) + 'T12:00:00.000Z';
        finalDateConfidence = userStatedISO ? 'user_provided' : 'low';
      }

      return {
        id: 'imp-shot-' + Date.now() + '-' + i,
        source: 'garmin_screenshot' as const,
        date: finalDate,
        type: a.type,
        name: a.name,
        duration_seconds: a.duration_seconds,
        distance_km,
        calories: a.calories,
        avg_hr: a.avg_hr,
        max_hr: a.max_hr,
        elevation_m,
        notes: a.notes,
        raw: {
          confidence: a.confidence,
          date_confidence: finalDateConfidence,
          original_distance_unit: a.distance_unit,
          original_elevation_unit: a.elevation_unit,
        },
        imported_at: importedAt,
      };
    });

    return Response.json({
      workouts,
      parsed: workouts.length,
      low_confidence_count: workouts.filter(w => w.raw.confidence === 'low').length,
      // Activities the user should review carefully — date came from fallback
      uncertain_date_count: workouts.filter(w =>
        w.raw.date_confidence === 'low' || w.raw.date_confidence === 'user_provided'
      ).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Screenshot import failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
