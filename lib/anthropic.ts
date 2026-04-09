import Anthropic from '@anthropic-ai/sdk';

// Shared Anthropic client — routed through Helicone for observability.
// All AI calls should go through this client (not `new Anthropic()`).
export const anthropic = new Anthropic({
  baseURL: 'https://anthropic.helicone.ai',
  defaultHeaders: {
    'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
  },
});

// ── Model Registry (April 2026) ──
// Pricing per 1M tokens (input / output):
//   fast  (Haiku 4.5)  — $1   / $5
//   smart (Sonnet 4.6) — $3   / $15
//   deep  (Opus 4.6)   — $5   / $25
export const MODELS = {
  fast: 'claude-haiku-4-5' as const,
  smart: 'claude-sonnet-4-6' as const,
  deep: 'claude-opus-4-6' as const,
} as const;

// ── Task types → model mapping ──
// Hand-assigned rules instead of classifier routing. Simple, predictable, zero overhead.
export type TaskType =
  // Fast tier (Haiku)
  | 'classify'          // short input, structured JSON output
  | 'extract'           // receipt, document parsing
  | 'brief'             // one-liner, insight, small summary
  | 'content'           // morning reflection, daily content
  | 'triage'            // email triage, content routing
  | 'search-expand'     // search query expansion
  | 'draft'             // email drafts, replies
  | 'vision.receipt'    // receipt parsing
  | 'vision.general'    // general image analysis

  // Smart tier (Sonnet)
  | 'plan'              // daily planner
  | 'summary.book'      // book summaries (long, structured)
  | 'summary.long'      // document analysis, weekly review
  | 'tone-profile'      // writing style extraction
  | 'agent.tools'       // Cerebro agent loop
  | 'code-gen'          // task executor, telegram dev bot
  | 'vision.diagram'    // diagram generation from image

  // Deep tier (Opus — reserved, currently unused)
  | 'deep-reasoning';

/**
 * Pick a model based on task type.
 * This is the routing layer — hand-coded rules, no classifier, no ML.
 * Default: Haiku (the cheapest tier).
 */
export function pickModel(task: TaskType): string {
  switch (task) {
    // Fast tier — Haiku is sufficient
    case 'classify':
    case 'extract':
    case 'brief':
    case 'content':
    case 'triage':
    case 'search-expand':
    case 'draft':
    case 'vision.receipt':
    case 'vision.general':
      return MODELS.fast;

    // Smart tier — Sonnet for complex reasoning, long output, tools
    case 'plan':
    case 'summary.book':
    case 'summary.long':
    case 'tone-profile':
    case 'agent.tools':
    case 'code-gen':
    case 'vision.diagram':
      return MODELS.smart;

    // Deep tier — Opus (reserved)
    case 'deep-reasoning':
      return MODELS.deep;

    default:
      return MODELS.fast;
  }
}

/**
 * Build a system prompt with automatic prompt caching on the static prefix.
 *
 * Usage:
 *   const system = cachedSystem(STATIC_RULES);
 *   // or with a dynamic suffix (time, date, user context):
 *   const system = cachedSystem(STATIC_RULES, `Current time: ${now}`);
 *
 * The first block is marked cache_control: ephemeral (5-min TTL, 10% read cost).
 * The second block (if provided) is not cached and can change per-request.
 *
 * Break-even: 1 cache hit on the static prefix pays for the 1.25x write overhead.
 */
export function cachedSystem(staticText: string, dynamicText?: string): Anthropic.Messages.TextBlockParam[] {
  const blocks: Anthropic.Messages.TextBlockParam[] = [
    {
      type: 'text',
      text: staticText,
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (dynamicText && dynamicText.trim()) {
    blocks.push({
      type: 'text',
      text: dynamicText,
    });
  }
  return blocks;
}
