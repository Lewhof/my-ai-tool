// Vision OCR for Garmin (or any fitness app) screenshots → ImportedWorkout[].
// Uses Claude Haiku for cost; one screenshot can contain multiple activities.
// Output is a structured tool_use call so we always get clean JSON.

import { anthropic, MODELS } from '@/lib/anthropic';

const SYSTEM = `You are extracting structured workout data from a fitness app screenshot (typically Garmin Connect, but also Strava, Apple Fitness, Polar, etc.).

Rules:
- Extract every distinct activity visible. A single screenshot may show one activity in detail, or a list of multiple activities.
- For dates, use ISO YYYY-MM-DDTHH:MM:SS format (UTC). If only a date is shown, use 12:00:00. If only a relative time is shown ("Today, 2 hours ago"), make a reasonable absolute estimate based on context.
- ALWAYS return units as you see them in the source. Use the units field per workout (km/mi, kcal/kJ, m/ft).
- For type, normalise to common categories: "Running", "Cycling", "Strength Training", "Walking", "Hiking", "Swimming", "Yoga", "HIIT", "Rowing", "Other".
- If a field isn't shown or you can't read it confidently, leave it null. Don't invent.
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
            confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Your confidence in the extraction overall for this activity' },
            notes: { type: 'string', description: 'Anything notable but not categorised' },
          },
          required: ['date', 'type', 'confidence'],
        },
      },
    },
    required: ['activities'],
  },
};

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: Request) {
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
            { type: 'image', source: { type: 'base64', media_type: file.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: base64 } },
            { type: 'text', text: 'Extract every workout activity visible. Use the emit_activities tool.' },
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

      return {
        id: 'imp-shot-' + Date.now() + '-' + i,
        source: 'garmin_screenshot' as const,
        date: a.date,
        type: a.type,
        name: a.name,
        duration_seconds: a.duration_seconds,
        distance_km,
        calories: a.calories,
        avg_hr: a.avg_hr,
        max_hr: a.max_hr,
        elevation_m,
        notes: a.notes,
        raw: { confidence: a.confidence, original_distance_unit: a.distance_unit, original_elevation_unit: a.elevation_unit },
        imported_at: importedAt,
      };
    });

    return Response.json({
      workouts,
      parsed: workouts.length,
      low_confidence_count: workouts.filter(w => w.raw.confidence === 'low').length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Screenshot import failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
