import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';

// AGI-level coach: Sonnet + adaptive thinking + native web_search.
// Streams text deltas back as plain text. After streaming completes, appends a
// compact JSON manifest line beginning with `\n\n[[META]]` containing thinking
// summary + sources + tool uses, so the client can show those in the UI.

interface TrainingSummaryShape {
  last_7d_total: number;
  last_30d_total: number;
  last_30d_by_type: Record<string, number>;
  last_30d_running_km: number;
  last_30d_strength_volume_kg: number;
  last_30d_active_days: number;
  longest_recent_gap_days: number;
  current_streak_days: number;
  most_recent_activities: Array<{
    date: string;
    kind: 'session' | 'import';
    name: string;
    duration_min?: number;
    distance_km?: number;
    volume_kg?: number;
    avg_hr?: number;
    rating?: number;
  }>;
  median_running_distance_km?: number;
  weekly_target: number;
  weekly_target_pct: number;
}

interface ApiRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: {
    profile?: { goal?: string; difficulty?: string; weight_kg?: number; weekly_target?: number };
    // New: rich digest of all activity (sessions + imports). Replaces bare recent_sessions.
    training_summary?: TrainingSummaryShape;
    // Legacy field kept for compatibility — Quick mode v1 still passes this
    recent_sessions?: Array<{ name: string; date: string; volume_kg?: number; rating?: number }>;
    recent_prs?: Array<{ exercise: string; type: string; value: number; unit: string }>;
    active_plan?: { name: string; week_num: number; weeks_total: number } | null;
  };
  thinking_budget?: number; // 1024..16384
  enable_web_search?: boolean;
}

const SYSTEM = `You are an elite strength & conditioning coach inside the LH Fitness app. You operate at the level of a top-1% personal trainer — think Joe Bennett, Greg Nuckols, Mike Israetel — combining current sports-science research with practical programming sense.

WAY OF WORKING:
1. **Socratic first**. Don't dump prescriptions. Ask one or two sharp clarifying questions before recommending. Examples: "What's your current 5K time?" / "How long have you held your current squat PR?" / "Are you closer to fresh or burnt out right now?" Skip this only if the user has explicitly said "just give me the plan" or context is already clear.
2. **Cite when you research**. If you use the web_search tool, weave findings into the conversation naturally — "the latest meta-analysis on volume landmarks suggests..." rather than dumping URLs.
3. **Be opinionated**. Top trainers have strong views. Don't hedge. If the user's idea is wrong, say so — and explain why with mechanism.
4. **Honour boundaries**. No medical advice; defer injury/pain questions to a physio. No supplement-magic-bullet claims.
5. **Plan synthesis**. When the user signals they're ready ("build me a plan", "let's lock this in", "design the block"), tell them you'll synthesise the plan in a separate step — don't try to dump a full week-by-week table in chat. The synthesis tool runs after this conversation ends.

STYLE:
- Direct, warm, no fluff. 2–4 short paragraphs is the sweet spot.
- Bullets only for true lists of 3+ distinct items.
- Reference user data (PRs, recent sessions, profile goals) when relevant.

You're embedded in an app with: workout library, AI workout generator, live training session tracker, body metric logging, PR tracking, calendar/plan view.`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  try {
    const body: ApiRequest = await req.json();
    const { messages, context, thinking_budget = 4096, enable_web_search = true } = body;

    if (!messages?.length) return new Response('No messages', { status: 400 });

    // Build a context preamble — gives the coach grounding in the user's actual data.
    // The training_summary block aggregates BOTH manual in-app sessions AND imported
    // Garmin/external activities, so the coach sees the user's actual training load
    // (not just what they logged via the workout tracker).
    let systemWithContext = SYSTEM;
    if (context) {
      const lines: string[] = ['\n\nUser context (use this to ground every recommendation):'];
      if (context.profile) {
        const p = context.profile;
        lines.push(`- Goal(s): ${p.goal ?? 'not set'}`);
        lines.push(`- Level: ${p.difficulty ?? 'not set'}`);
        if (p.weight_kg) lines.push(`- Body weight: ${p.weight_kg}kg`);
        if (p.weekly_target) lines.push(`- Weekly target: ${p.weekly_target} sessions`);
      }

      const ts = context.training_summary;
      if (ts) {
        lines.push('');
        lines.push('Training load (last 30 days, includes both in-app sessions AND imported Garmin/external activities):');
        lines.push(`- Active days: ${ts.last_30d_active_days}/30 · This week: ${ts.last_7d_total}/${ts.weekly_target} target (${ts.weekly_target_pct}%)`);
        lines.push(`- Current streak: ${ts.current_streak_days} day${ts.current_streak_days === 1 ? '' : 's'} · Longest gap in last 30d: ${ts.longest_recent_gap_days} day${ts.longest_recent_gap_days === 1 ? '' : 's'}`);
        const typeLines = Object.entries(ts.last_30d_by_type)
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => `${n}× ${t}`)
          .join(', ');
        if (typeLines) lines.push(`- Activity mix: ${typeLines}`);
        if (ts.last_30d_running_km > 0) {
          lines.push(`- Running mileage (30d): ${ts.last_30d_running_km}km${ts.median_running_distance_km ? ` · median run ${ts.median_running_distance_km}km` : ''}`);
        }
        if (ts.last_30d_strength_volume_kg > 0) {
          lines.push(`- Strength volume (30d): ${ts.last_30d_strength_volume_kg.toLocaleString()}kg lifted`);
        }
        if (ts.most_recent_activities.length > 0) {
          lines.push('');
          lines.push('Most recent activities (newest first):');
          ts.most_recent_activities.forEach(a => {
            const date = new Date(a.date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
            const kindTag = a.kind === 'import' ? ' [external]' : '';
            const detail = [
              a.duration_min ? `${a.duration_min}min` : null,
              a.distance_km ? `${a.distance_km.toFixed(2)}km` : null,
              a.volume_kg ? `${Math.round(a.volume_kg)}kg vol` : null,
              a.avg_hr ? `avg ${a.avg_hr}bpm` : null,
              a.rating ? `felt ${a.rating}/5` : null,
            ].filter(Boolean).join(' · ');
            lines.push(`  · ${date} — ${a.name}${kindTag}${detail ? ` (${detail})` : ''}`);
          });
        }
      } else if (context.recent_sessions?.length) {
        // Legacy path (Quick mode v1)
        lines.push(`- Last ${context.recent_sessions.length} sessions:`);
        context.recent_sessions.forEach(s => {
          const date = new Date(s.date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
          lines.push(`  · ${date} — ${s.name}${s.volume_kg ? ` (${Math.round(s.volume_kg)}kg total volume)` : ''}${s.rating ? ` — felt ${s.rating}/5` : ''}`);
        });
      }

      if (context.recent_prs?.length) {
        lines.push('');
        lines.push(`Recent PRs: ${context.recent_prs.map(p => `${p.exercise} ${p.value}${p.unit}`).join(', ')}`);
      }
      if (context.active_plan) {
        lines.push(`Currently on plan "${context.active_plan.name}" — week ${context.active_plan.week_num}/${context.active_plan.weeks_total}`);
      } else if (context.active_plan === null) {
        lines.push('No active training plan');
      }
      systemWithContext += lines.join('\n');
    }

    // Tool config
    const tools: Array<Record<string, unknown>> = [];
    if (enable_web_search) {
      tools.push({
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: 8,
      });
    }

    // Stream — use the modern adaptive thinking API
    // Note: Helicone proxy may strip thinking blocks; we attempt anyway and fall back gracefully.
    type CreateParams = Parameters<typeof anthropic.messages.stream>[0];
    const params: CreateParams = {
      model: MODELS.smart,
      max_tokens: 8192,
      system: systemWithContext,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      // adaptive thinking — newer pattern; budget bounds the reasoning tokens
      thinking: { type: 'enabled', budget_tokens: Math.max(1024, Math.min(16384, thinking_budget)) },
    };
    if (tools.length > 0) (params as unknown as { tools: typeof tools }).tools = tools;

    const stream = await anthropic.messages.stream(params);

    const encoder = new TextEncoder();
    // Track meta to flush at the end
    const collectedThinking: string[] = [];
    const collectedToolUses: Array<{ tool: string; query?: string; sources?: Array<{ title: string; url: string; snippet?: string }> }> = [];

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let currentToolUse: { tool: string; query?: string; sources?: Array<{ title: string; url: string; snippet?: string }> } | null = null;

          for await (const event of stream) {
            switch (event.type) {
              case 'content_block_start': {
                const block = event.content_block;
                if (block.type === 'server_tool_use' && block.name === 'web_search') {
                  currentToolUse = { tool: 'web_search', sources: [] };
                  // Stream a subtle marker so the client can show "Searching the web..."
                  controller.enqueue(encoder.encode('​')); // zero-width space — keeps stream alive without visible char
                } else if (block.type === 'web_search_tool_result') {
                  // Results arrive as a content block with the search results
                  const results = (block as unknown as { content?: Array<{ url?: string; title?: string; encrypted_content?: string }> }).content;
                  if (currentToolUse && Array.isArray(results)) {
                    currentToolUse.sources = results.slice(0, 5).map(r => ({
                      title: r.title || r.url || 'source',
                      url: r.url || '',
                      snippet: undefined,
                    }));
                    collectedToolUses.push(currentToolUse);
                    currentToolUse = null;
                  }
                }
                break;
              }
              case 'content_block_delta': {
                const delta = event.delta;
                if (delta.type === 'text_delta') {
                  controller.enqueue(encoder.encode(delta.text));
                } else if (delta.type === 'thinking_delta') {
                  collectedThinking.push(delta.thinking);
                } else if (delta.type === 'input_json_delta' && currentToolUse) {
                  // web_search query arrives as JSON delta — accumulate
                  currentToolUse.query = (currentToolUse.query || '') + delta.partial_json;
                }
                break;
              }
              case 'content_block_stop':
                // Finalise tool query string if it was a search
                if (currentToolUse && currentToolUse.tool === 'web_search') {
                  try {
                    const parsed = JSON.parse(currentToolUse.query || '{}');
                    currentToolUse.query = parsed.query || currentToolUse.query;
                  } catch { /* leave raw */ }
                }
                break;
              case 'message_stop': {
                // Flush meta as a single trailing JSON line
                const meta = {
                  thinking: collectedThinking.join('').trim() || undefined,
                  tool_uses: collectedToolUses.length > 0 ? collectedToolUses : undefined,
                };
                if (meta.thinking || meta.tool_uses) {
                  controller.enqueue(encoder.encode('\n\n[[META]]' + JSON.stringify(meta)));
                }
                break;
              }
            }
          }
          controller.close();
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : 'stream error';
          controller.enqueue(encoder.encode(`\n\n[[ERROR]]${errMsg}`));
          controller.close();
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
    const msg = e instanceof Error ? e.message : 'Coach v2 failed';
    return new Response(msg, { status: 500 });
  }
}
