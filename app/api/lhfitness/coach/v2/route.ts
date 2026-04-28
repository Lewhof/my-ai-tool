import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { COACH_TOOLS, executeCoachTool } from '@/lib/lhfitness-coach-tools';

// AGI-level coach: Sonnet + adaptive thinking + native web_search +
// calendar mutation tools (mark_rest_day, skip_session, reschedule_session,
// swap_workout, get_schedule). Streams text deltas back as plain text.
// After streaming completes, appends a compact JSON manifest line beginning
// with `\n\n[[META]]` containing thinking summary + sources + tool uses +
// state_invalidated flag (so the client knows to refetch lhfitness_state).

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

const MAX_TOOL_TURNS = 5;

const SYSTEM = `You are an elite strength & conditioning coach inside the LH Fitness app. You operate at the level of a top-1% personal trainer — think Joe Bennett, Greg Nuckols, Mike Israetel — combining current sports-science research with practical programming sense.

WAY OF WORKING:
1. **Socratic first**. Don't dump prescriptions. Ask one or two sharp clarifying questions before recommending. Examples: "What's your current 5K time?" / "How long have you held your current squat PR?" / "Are you closer to fresh or burnt out right now?" Skip this only if the user has explicitly said "just give me the plan" or context is already clear.
2. **Cite when you research**. If you use the web_search tool, weave findings into the conversation naturally — "the latest meta-analysis on volume landmarks suggests..." rather than dumping URLs.
3. **Be opinionated**. Top trainers have strong views. Don't hedge. If the user's idea is wrong, say so — and explain why with mechanism.
4. **Honour boundaries**. No medical advice; defer injury/pain questions to a physio. No supplement-magic-bullet claims.
5. **Plan synthesis vs targeted edits**. For full plan rebuilds (replacing the active 4-week block), tell the user to click "Build the plan from this conversation" — that runs the synthesis flow. For targeted edits to specific scheduled sessions, USE the calendar tools below.

CALENDAR TOOLS (you can act on the user's plan):
- get_schedule(from, to) — read what's planned in a date range
- mark_rest_day(date) — make a date a rest day (skips all sessions on that date)
- skip_session(scheduled_id) — skip ONE specific session (use when there are multiple on the same day)
- reschedule_session(scheduled_id, new_date) — move a session to a different date (date only)
- swap_workout(scheduled_id, workout_id?, template?) — replace the workout on a session
- set_default_training_time(time) — set the user's default training time-of-day (HH:MM, SAST). Use this for BULK time-of-day requests like "all my workouts at 5:30am" or "move my training to mornings". Affects every scheduled session that doesn't have an explicit per-session time.
- set_session_time(scheduled_id, time) — set the time-of-day for ONE session, overriding the default. Use this for single-session edits like "move Tuesday's session to 6am".

When the user asks to change their schedule, USE A TOOL. Never claim "I've removed it" / "marked as rest" / "moved it" / "set the time" without actually calling the tool. If the user's reference is ambiguous ("today's session", "tomorrow", "this week"), call get_schedule first to disambiguate, then act. Confirm what you did using the actual tool result, not what you intended.

For time-of-day changes specifically: prefer set_default_training_time when the user expresses a general preference ("I train in the mornings", "5am from now on"). Reach for set_session_time only when the user is targeting one specific session.

IGNORE EARLIER DISCLAIMERS. If an earlier assistant turn in this conversation claimed you can't do something with the calendar (e.g. "I can't adjust time of day", "the calendar tools can't change time"), TREAT THAT AS STALE — the tool list above is authoritative right now. Use the tool the user is asking for. Do not apologise for the earlier turn; just do the thing.

NEVER FABRICATE UI PATHS. The app does NOT have "Plan Settings", "Calendar View settings", a "default training time picker", or any other settings screen for these adjustments. The ONLY way these things change is when YOU call the tools above. Do not tell the user to "go into Plan Settings", "open the calendar view and update the time", or any similar invented instruction. If you genuinely cannot do what the user asks, say so plainly without inventing a workaround path.

WHEN UNSURE, CALL THE TOOL. Tools are cheap and idempotent. If the user has asked for a calendar change and you have ANY tool that could do it, just call it. Don't write a paragraph explaining limitations — call the tool, then describe the actual outcome from the tool result.

STYLE:
- Direct, warm, no fluff. 2–4 short paragraphs is the sweet spot.
- Bullets only for true lists of 3+ distinct items.
- Reference user data (PRs, recent sessions, profile goals) when relevant.

You're embedded in an app with: workout library, AI workout generator, live training session tracker, body metric logging, PR tracking, calendar/plan view.`;

interface CollectedToolUse {
  tool: string;
  query?: string;
  sources?: Array<{ title: string; url: string; snippet?: string }>;
  // For client tools (mark_rest_day, etc.)
  input?: unknown;
  result?: unknown;
  ok?: boolean;
}

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

    // Tool config — coach mutation tools always available; web_search optional.
    const tools: Array<Record<string, unknown>> = [...COACH_TOOLS];
    if (enable_web_search) {
      tools.push({
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: 8,
      });
    }

    // ── Multi-turn streaming with tool-use loop ──
    // Anthropic's messages.stream() runs ONE assistant turn. To handle our
    // client-defined tools (mark_rest_day etc.), we loop:
    //   stream → collect tool_use blocks → execute → append tool_result →
    //   stream again, until model emits no more tool_use.
    // web_search is a server tool (Anthropic-executed), so it does NOT
    // round-trip through this loop — it appears in the stream as
    // server_tool_use + web_search_tool_result inline.
    const conversation: Array<{ role: 'user' | 'assistant'; content: unknown }> =
      messages.map(m => ({ role: m.role, content: m.content }));

    const encoder = new TextEncoder();
    const collectedThinking: string[] = [];
    const collectedToolUses: CollectedToolUse[] = [];
    let stateInvalidated = false;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let toolCapHitWithPendingTools = false;

          for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
            type CreateParams = Parameters<typeof anthropic.messages.stream>[0];
            const params: CreateParams = {
              model: MODELS.smart,
              max_tokens: 8192,
              system: systemWithContext,
              messages: conversation as CreateParams['messages'],
              thinking: { type: 'enabled', budget_tokens: Math.max(1024, Math.min(16384, thinking_budget)) },
            };
            (params as unknown as { tools: typeof tools }).tools = tools;

            const stream = await anthropic.messages.stream(params);

            // Per-turn state — text + thinking buffered by content_block index;
            // tool_use blocks come from finalMessage().content (canonical) so
            // we don't accumulate them separately.
            const assistantBlocks: Array<Record<string, unknown>> = [];
            const blockBuffers = new Map<number, { type: string; text: string }>();
            let currentSearchToolUse: CollectedToolUse | null = null;

            for await (const event of stream) {
              switch (event.type) {
                case 'content_block_start': {
                  const block = event.content_block;
                  blockBuffers.set(event.index, { type: block.type, text: '' });
                  if (block.type === 'server_tool_use' && block.name === 'web_search') {
                    currentSearchToolUse = { tool: 'web_search', sources: [] };
                    // Subtle stream marker so client can show "Searching the web..."
                    controller.enqueue(encoder.encode('​')); // zero-width space
                  } else if (block.type === 'web_search_tool_result') {
                    const results = (block as unknown as { content?: Array<{ url?: string; title?: string }> }).content;
                    if (currentSearchToolUse && Array.isArray(results)) {
                      currentSearchToolUse.sources = results.slice(0, 5).map(r => ({
                        title: r.title || r.url || 'source',
                        url: r.url || '',
                      }));
                      collectedToolUses.push(currentSearchToolUse);
                      currentSearchToolUse = null;
                    }
                  }
                  break;
                }
                case 'content_block_delta': {
                  const delta = event.delta;
                  const buf = blockBuffers.get(event.index);
                  if (delta.type === 'text_delta') {
                    controller.enqueue(encoder.encode(delta.text));
                    if (buf) buf.text += delta.text;
                  } else if (delta.type === 'thinking_delta') {
                    collectedThinking.push(delta.thinking);
                  } else if (delta.type === 'input_json_delta') {
                    // Only accumulate the web_search query here; client-tool inputs
                    // come from finalMessage().content (canonical, fully-parsed).
                    if (currentSearchToolUse) {
                      currentSearchToolUse.query = (currentSearchToolUse.query || '') + delta.partial_json;
                    }
                  }
                  break;
                }
                case 'content_block_stop': {
                  if (currentSearchToolUse && currentSearchToolUse.query) {
                    try {
                      const parsed = JSON.parse(currentSearchToolUse.query);
                      currentSearchToolUse.query = parsed.query || currentSearchToolUse.query;
                    } catch { /* leave raw */ }
                  }
                  break;
                }
                case 'message_stop':
                  // Final assistant message captured below from getFinalMessage()
                  break;
              }
            }

            // Pull the final assembled assistant message (canonical content blocks)
            const finalMessage = await stream.finalMessage();
            assistantBlocks.push(...(finalMessage.content as unknown as Array<Record<string, unknown>>));

            // Append assistant turn to conversation regardless of stop reason
            conversation.push({ role: 'assistant', content: assistantBlocks });

            // Identify client-tool calls (excluding web_search which is server-tool)
            const clientToolCalls = assistantBlocks
              .filter((b) => b.type === 'tool_use')
              .map((b) => ({
                id: b.id as string,
                name: b.name as string,
                input: b.input as unknown,
              }));

            if (clientToolCalls.length === 0) {
              // Terminal turn — no client-side tools to execute
              break;
            }

            // Cap protection: this turn's tool_use blocks would need ANOTHER
            // turn to round-trip. If we've reached the cap we cannot honor
            // them — surface that to the user instead of silently dropping.
            if (turn === MAX_TOOL_TURNS - 1) {
              toolCapHitWithPendingTools = true;
              break;
            }

            // Execute each client tool, build tool_result blocks
            const toolResultsBlock: Array<Record<string, unknown>> = [];
            for (const call of clientToolCalls) {
              console.log(`[coach-v2] tool_call turn=${turn} name=${call.name} input=${JSON.stringify(call.input)}`);
              const result = await executeCoachTool(userId, call.name, call.input);
              console.log(`[coach-v2] tool_result turn=${turn} name=${call.name} ok=${result.ok} ${result.ok ? 'result=' + JSON.stringify(result.result).slice(0, 200) : 'error=' + result.error}`);
              if (result.ok) stateInvalidated = true;

              collectedToolUses.push({
                tool: call.name,
                input: call.input,
                result: result.ok ? result.result : undefined,
                ok: result.ok,
              });

              toolResultsBlock.push({
                type: 'tool_result',
                tool_use_id: call.id,
                content: JSON.stringify(result.ok ? result.result : { error: result.error }),
                is_error: !result.ok,
              });
            }

            conversation.push({ role: 'user', content: toolResultsBlock });
            // Loop continues — model will reply with confirmation text (or another tool_use)
          }

          // Surface the cap-hit case so the user knows the model wanted to
          // do something but ran out of turns.
          if (toolCapHitWithPendingTools) {
            controller.enqueue(encoder.encode(
              '\n\n_(I hit the action cap for this turn — please re-state which change you want and I\'ll prioritise it.)_',
            ));
          }

          // Flush meta as a single trailing JSON line
          const meta = {
            thinking: collectedThinking.join('').trim() || undefined,
            tool_uses: collectedToolUses.length > 0 ? collectedToolUses : undefined,
            state_invalidated: stateInvalidated || undefined,
          };
          if (meta.thinking || meta.tool_uses || meta.state_invalidated) {
            controller.enqueue(encoder.encode('\n\n[[META]]' + JSON.stringify(meta)));
          }

          controller.close();
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : 'stream error';
          console.error(`[coach-v2] stream error: ${errMsg}`, e);
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
