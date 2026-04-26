import { anthropic, MODELS } from '@/lib/anthropic';

// Plan synthesis: takes the coach conversation + context, returns a structured TrainingPlan.
// Uses Anthropic tool_choice forced JSON output. No web search, no thinking — pure synthesis.

interface ApiRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: {
    profile?: { goals?: string[]; difficulty?: string; weight_kg?: number; weekly_target?: number; available_equipment?: string[] };
    library_workouts?: Array<{ id: string; name: string; goal: string; difficulty: string; duration_min: number; primary_muscles: string[]; equipment: string[] }>;
  };
  weeks?: number;        // default 4
  starts_on?: string;    // ISO YYYY-MM-DD; default = next Monday
}

const SYSTEM = `You are synthesising a structured multi-week training plan from a coaching conversation.

OUTPUT REQUIREMENTS:
- Return ONLY a single tool_use call to "emit_training_plan"
- The plan must reflect what was discussed in the conversation
- For each workout day, prefer binding to a workout_id from the user's library when available; otherwise use a template description
- Match the user's available equipment, weekly target, difficulty, and goals
- Sensible week structure: alternating intensities, deload every 4th week if duration ≥ 8 weeks, rest days appropriate to difficulty
- Day offsets: 0=Mon, 6=Sun. Spread sessions across the week, not all bunched
- Themes per week should reflect periodisation (e.g. "Volume base", "Intensification", "Deload", "Test week")

Be precise. The output is consumed by code, not displayed verbatim — but the plan structure will drive the user's actual training for weeks.`;

const TOOL = {
  name: 'emit_training_plan',
  description: 'Emit the synthesised training plan as structured JSON.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: '2-6 word evocative plan name' },
      description: { type: 'string', description: '1-2 sentence summary of the plan\'s intent' },
      goals: { type: 'array', items: { type: 'string', enum: ['strength', 'hypertrophy', 'endurance', 'fat_loss', 'mobility', 'athletic'] } },
      weeks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            week_num: { type: 'integer', minimum: 1 },
            theme: { type: 'string' },
            days: {
              type: 'array',
              minItems: 7,
              maxItems: 7,
              items: {
                type: 'object',
                properties: {
                  day_offset: { type: 'integer', minimum: 0, maximum: 6 },
                  type: { type: 'string', enum: ['workout', 'rest', 'optional'] },
                  workout_id: { type: 'string', description: 'ID of a workout from the user\'s library, if a good match exists' },
                  template: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      primary_muscles: { type: 'array', items: { type: 'string' } },
                      duration_min: { type: 'integer' },
                      intensity: { type: 'string', enum: ['easy', 'moderate', 'hard'] },
                      notes: { type: 'string' },
                    },
                    required: ['name'],
                  },
                },
                required: ['day_offset', 'type'],
              },
            },
          },
          required: ['week_num', 'days'],
        },
      },
    },
    required: ['name', 'description', 'goals', 'weeks'],
  },
};

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body: ApiRequest = await req.json();
    const { messages, context, weeks = 4 } = body;
    const startsOn = body.starts_on || nextMonday();

    if (!messages?.length) {
      return Response.json({ error: 'No messages' }, { status: 400 });
    }

    let systemWithContext = SYSTEM;
    const lines: string[] = ['\n\nSynthesis instructions:', `- Build a ${weeks}-week plan starting ${startsOn} (week 1 day 0 = Mon ${startsOn})`];
    if (context?.profile) {
      const p = context.profile;
      if (p.goals?.length) lines.push(`- User goals: ${p.goals.join(', ')}`);
      if (p.difficulty) lines.push(`- Difficulty: ${p.difficulty}`);
      if (p.weekly_target) lines.push(`- Sessions per week target: ${p.weekly_target}`);
      if (p.available_equipment?.length) lines.push(`- Available equipment: ${p.available_equipment.join(', ')}`);
    }
    if (context?.library_workouts?.length) {
      lines.push(`\nAvailable library workouts (use workout_id to bind):`);
      context.library_workouts.slice(0, 30).forEach(w => {
        lines.push(`  · ${w.id} — "${w.name}" (${w.goal}/${w.difficulty}, ${w.duration_min}min, muscles: ${w.primary_muscles.join('+')})`);
      });
    }
    systemWithContext += lines.join('\n');

    // Distil conversation into a single user message — keeps prompt cheap and focused
    const conversationDigest = messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
    const userMsg = `Here is the coaching conversation. Synthesise the plan we discussed.\n\n${conversationDigest}\n\n---\nNow emit the plan via the emit_training_plan tool.`;

    type CreateParams = Parameters<typeof anthropic.messages.create>[0];
    const params: CreateParams = {
      model: MODELS.smart,
      max_tokens: 8192,
      system: systemWithContext,
      messages: [{ role: 'user', content: userMsg }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'emit_training_plan' },
    };

    const completion = await anthropic.messages.create(params) as Awaited<ReturnType<typeof anthropic.messages.create>> & { content: Array<{ type: string; input?: unknown }> };
    const toolBlock = completion.content.find((c: { type: string }) => c.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return Response.json({ error: 'No tool_use in response' }, { status: 500 });
    }

    const planInput = toolBlock.input as {
      name: string;
      description: string;
      goals: string[];
      weeks: Array<{
        week_num: number;
        theme?: string;
        days: Array<{
          day_offset: number;
          type: 'workout' | 'rest' | 'optional';
          workout_id?: string;
          template?: { name: string; primary_muscles?: string[]; duration_min?: number; intensity?: string; notes?: string };
        }>;
      }>;
    };

    const now = new Date().toISOString();
    const plan = {
      id: 'plan-' + Date.now(),
      name: planInput.name,
      description: planInput.description,
      source: 'ai_coach' as const,
      goals: planInput.goals,
      weeks: planInput.weeks,
      active: false,           // user activates on commit
      starts_on: startsOn,
      created_at: now,
    };

    return Response.json({ plan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Synthesis failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
