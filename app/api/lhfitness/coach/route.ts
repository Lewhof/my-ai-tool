import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';

interface CoachRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: {
    profile?: { goal?: string; difficulty?: string; weight_kg?: number; weekly_target?: number };
    recent_sessions?: Array<{ name: string; date: string; volume_kg?: number; rating?: number }>;
    recent_prs?: Array<{ exercise: string; type: string; value: number; unit: string }>;
  };
}

const SYSTEM = `You are a sharp, supportive personal training coach inside the LH Fitness app. Tone: direct, knowledgeable, never preachy. You give concise, actionable advice — no fluff, no disclaimers.

Style:
- Talk like a friend who happens to be a coach. Skip the "great question!" openers.
- Default to 2-4 short paragraphs unless the user explicitly asks for detail
- Use bullets only when listing 3+ distinct items
- Reference the user's actual data when given (sessions, PRs, profile)
- If the user asks for a workout, briefly suggest the structure but tell them to use the "Generate" feature for a full session

Boundaries:
- Don't pretend to be a doctor or physiotherapist. If injury or medical: tell them to see a professional.
- If they ask about supplements/cutting/extreme protocols, give the honest evidence-based answer.

You're embedded in an app with: workout library, AI workout generator, live training session tracker, body metric logging, and PR tracking.`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  try {
    const body: CoachRequest = await req.json();
    const { messages, context } = body;

    if (!messages?.length) {
      return new Response('No messages', { status: 400 });
    }

    // Build a context preamble — gives the coach grounding in the user's actual data
    let systemWithContext = SYSTEM;
    if (context) {
      const lines: string[] = ['\n\nUser context:'];
      if (context.profile) {
        const p = context.profile;
        lines.push(`- Goal: ${p.goal ?? 'not set'}`);
        lines.push(`- Level: ${p.difficulty ?? 'not set'}`);
        if (p.weight_kg) lines.push(`- Body weight: ${p.weight_kg}kg`);
        if (p.weekly_target) lines.push(`- Weekly target: ${p.weekly_target} sessions`);
      }
      if (context.recent_sessions?.length) {
        lines.push(`- Last ${context.recent_sessions.length} sessions:`);
        context.recent_sessions.forEach(s => {
          const date = new Date(s.date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
          lines.push(`  · ${date} — ${s.name}${s.volume_kg ? ` (${Math.round(s.volume_kg)}kg total volume)` : ''}${s.rating ? ` — felt ${s.rating}/5` : ''}`);
        });
      }
      if (context.recent_prs?.length) {
        lines.push(`- Recent PRs: ${context.recent_prs.map(p => `${p.exercise} ${p.value}${p.unit}`).join(', ')}`);
      }
      systemWithContext += lines.join('\n');
    }

    // Stream the response back as SSE-ish text events the client can read directly
    const stream = await anthropic.messages.stream({
      model: MODELS.fast,
      max_tokens: 1024,
      system: systemWithContext,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Coach failed';
    return new Response(msg, { status: 500 });
  }
}
