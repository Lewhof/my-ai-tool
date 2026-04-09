import { supabaseAdmin } from '@/lib/supabase-server';

// ── Agent Evolution helpers ──
// Learned rules, tool telemetry, and feedback primitives for Cerebro.
// Imported by /api/agent/route.ts and lib/agent/executor.ts.

type RuleRow = {
  id: string;
  rule: string;
  category: 'do' | 'dont' | 'prefer';
  active: boolean;
};

/**
 * Fetch active learned rules for a user and format them as a single
 * text block that can be appended to the dynamic portion of the
 * Cerebro system prompt. Returns an empty string if no rules exist.
 *
 * Rules are ordered by category (dont first — strongest), then by id.
 */
export async function getLearnedRules(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('cerebro_rules')
    .select('id, rule, category, active')
    .eq('user_id', userId)
    .eq('active', true)
    .order('category', { ascending: true })
    .limit(50);

  const rules = (data ?? []) as RuleRow[];
  if (rules.length === 0) return '';

  const donts = rules.filter((r) => r.category === 'dont').map((r) => `- ${r.rule}`);
  const dos = rules.filter((r) => r.category === 'do').map((r) => `- ${r.rule}`);
  const prefs = rules.filter((r) => r.category === 'prefer').map((r) => `- ${r.rule}`);

  const sections: string[] = [];
  if (donts.length) sections.push(`DO NOT:\n${donts.join('\n')}`);
  if (dos.length) sections.push(`ALWAYS:\n${dos.join('\n')}`);
  if (prefs.length) sections.push(`PREFERENCES:\n${prefs.join('\n')}`);

  return `LEARNED RULES (user feedback + past corrections — follow these):\n${sections.join('\n\n')}`;
}

/**
 * Fire-and-forget metric insert. Never throws.
 * Called from the executor wrapper after every tool invocation.
 */
export async function recordToolMetric(
  userId: string,
  toolName: string,
  durationMs: number,
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  try {
    await supabaseAdmin.from('cerebro_tool_metrics').insert({
      user_id: userId,
      tool_name: toolName,
      duration_ms: Math.round(durationMs),
      success,
      error_message: errorMessage || null,
    });
  } catch {
    // Silent — metrics must never break the request.
  }
}

/**
 * Bump the `hits` counter on any rules whose text appears in the
 * assistant response. Called fire-and-forget after a turn.
 * Helps the UI show which rules are actually "firing."
 */
export async function bumpRuleHits(userId: string, response: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('cerebro_rules')
      .select('id, rule')
      .eq('user_id', userId)
      .eq('active', true);

    const lower = response.toLowerCase();
    const hits: string[] = [];
    for (const r of (data ?? []) as { id: string; rule: string }[]) {
      // Crude: any 5+ char token from the rule that shows up in the response
      const tokens = r.rule.toLowerCase().split(/\s+/).filter((t) => t.length > 5);
      if (tokens.some((t) => lower.includes(t))) hits.push(r.id);
    }

    if (hits.length === 0) return;

    for (const id of hits) {
      await supabaseAdmin.rpc('increment_rule_hits', { p_id: id }).then(
        () => {},
        async () => {
          // RPC may not exist — fall back to read-modify-write
          const { data: cur } = await supabaseAdmin
            .from('cerebro_rules')
            .select('hits')
            .eq('id', id)
            .single();
          await supabaseAdmin
            .from('cerebro_rules')
            .update({ hits: (cur?.hits || 0) + 1 })
            .eq('id', id);
        },
      );
    }
  } catch {
    // Silent.
  }
}
