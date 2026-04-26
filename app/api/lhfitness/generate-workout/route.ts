import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';

interface GenerateRequest {
  goal: string;
  difficulty: string;
  duration_min: number;
  equipment: string[];
  focus?: string;          // free text — "push day", "legs", "core finisher"
  notes?: string;          // additional context
}

const SYSTEM = `You are an expert strength & conditioning coach. Generate ONE complete workout in strict JSON.

RULES:
- Match the user's goal, difficulty, duration, and available equipment exactly
- Choose 4–7 exercises that flow logically (compound lifts first, isolations last, finisher optional)
- Realistic volume: total time including rest must fit the duration_min budget
- Use these muscle group values only: chest, back, shoulders, biceps, triceps, core, quads, hamstrings, glutes, calves, forearms, cardio, fullbody, mobility
- Use these equipment values only: bodyweight, dumbbells, barbell, kettlebell, cable, machine, bands, pullup_bar, bench, box, rower, bike
- Set rest_seconds based on intensity: strength 120-180s, hypertrophy 60-90s, endurance 30-60s
- Provide a SHORT one-line coaching cue per exercise (form tip, the most important thing to remember)
- For time-based exercises (cardio, planks), include duration_seconds and use "time" in reps
- Name should be 2-4 words, evocative (e.g. "Push — Dumbbell Power", "Heavy Day", "20 Minute Burner")
- Description: 2 sentences, what the workout does + when to use it. No marketing fluff.

Return ONLY valid JSON in this exact shape:
{
  "name": "string",
  "description": "string",
  "primary_muscles": ["string", ...],
  "exercises": [
    {
      "name": "string",
      "primary": "muscle_group",
      "secondary": ["muscle_group", ...] | null,
      "equipment": ["equipment", ...],
      "sets": int,
      "reps": "string",
      "rest_seconds": int,
      "cue": "string",
      "duration_seconds": int | null
    }
  ]
}

No markdown, no commentary — just the JSON object.`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body: GenerateRequest = await req.json();
    const { goal, difficulty, duration_min, equipment, focus, notes } = body;

    if (!goal || !difficulty || !duration_min || !equipment?.length) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const userMsg = [
      `Goal: ${goal}`,
      `Difficulty: ${difficulty}`,
      `Duration: ${duration_min} minutes`,
      `Available equipment: ${equipment.join(', ')}`,
      focus ? `Focus / what I want today: ${focus}` : null,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join('\n');

    const completion = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });

    const block = completion.content.find(c => c.type === 'text');
    if (!block || block.type !== 'text') {
      return Response.json({ error: 'No response' }, { status: 500 });
    }

    let parsed;
    try {
      // Strip any stray code fences just in case
      const cleaned = block.text.trim().replace(/^```json\s*|\s*```$/g, '');
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return Response.json({ error: 'Invalid JSON from AI', raw: block.text.slice(0, 300) }, { status: 500 });
    }

    // Build the Workout object — caller (client) saves to localStorage
    const now = new Date().toISOString();
    const workout = {
      id: 'ai-' + Date.now(),
      name: String(parsed.name || 'AI Workout'),
      description: String(parsed.description || ''),
      goal,
      difficulty,
      duration_min,
      primary_muscles: Array.isArray(parsed.primary_muscles) ? parsed.primary_muscles : [],
      equipment,
      source: 'ai' as const,
      tags: ['ai-generated'],
      created_at: now,
      exercises: (parsed.exercises || []).map((e: Record<string, unknown>, i: number) => ({
        id: `ex-${Date.now()}-${i}`,
        name: String(e.name || 'Exercise'),
        primary: String(e.primary || 'fullbody'),
        secondary: Array.isArray(e.secondary) ? e.secondary : undefined,
        equipment: Array.isArray(e.equipment) ? e.equipment : equipment,
        sets: Number(e.sets) || 3,
        reps: String(e.reps || '10'),
        rest_seconds: Number(e.rest_seconds) || 60,
        cue: e.cue ? String(e.cue) : undefined,
        duration_seconds: e.duration_seconds ? Number(e.duration_seconds) : undefined,
      })),
    };

    return Response.json({ workout });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate';
    return Response.json({ error: msg }, { status: 500 });
  }
}
