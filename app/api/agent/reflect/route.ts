import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, pickModel } from '@/lib/anthropic';

// POST /api/agent/reflect
// Reads the last 50 conversation turns + all unresolved thumbs-down corrections,
// asks Sonnet to distill 1-5 candidate behavior rules, returns them for the user
// to approve one-by-one. Does NOT auto-insert — approval happens via the brain UI.

type CandidateRule = {
  rule: string;
  category: 'do' | 'dont' | 'prefer';
  reasoning: string;
};

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // 1. Load recent conversation — last 50 messages from the agent thread
  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('agent_thread', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  let conversation = '';
  if (thread) {
    const { data: msgs } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const ordered = (msgs ?? []).reverse();
    conversation = ordered
      .map((m) => `[${m.role.toUpperCase()}] ${m.content.slice(0, 600)}`)
      .join('\n\n');
  }

  // 2. Load unresolved corrections
  const { data: corrections } = await supabaseAdmin
    .from('cerebro_message_feedback')
    .select('rating, correction_text, message_id')
    .eq('user_id', userId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(20);

  const correctionText = (corrections ?? [])
    .filter((c) => c.correction_text || c.rating === 'down')
    .map((c) => `- [${c.rating}] ${c.correction_text || '(no text, thumbs-down only)'}`)
    .join('\n');

  // 3. Load existing rules so we don't propose duplicates
  const { data: existingRules } = await supabaseAdmin
    .from('cerebro_rules')
    .select('rule, category')
    .eq('user_id', userId)
    .eq('active', true);

  const existingText = (existingRules ?? []).map((r) => `- [${r.category}] ${r.rule}`).join('\n');

  if (!conversation && !correctionText) {
    return Response.json({
      candidates: [],
      message: 'Not enough history or corrections to reflect on yet. Use Cerebro for a while, then come back.',
    });
  }

  // 4. Ask Sonnet to distill candidate rules
  const systemPrompt = `You are a meta-coach watching an AI assistant (Cerebro) work with a user. Your job: distill 1-5 NEW behavior rules that would make Cerebro more useful in future conversations.

Output a JSON object: {"candidates":[{"rule":"...","category":"do|dont|prefer","reasoning":"..."}]}.

RULES FOR YOUR RULES:
- Must be short (< 150 chars), actionable, and written in second-person imperative ("Always confirm before...", "Never send...", "Prefer markdown bullets...")
- Must be GENERALIZABLE — not about a single one-off task
- Must NOT duplicate rules already in the active list below
- Must be supported by evidence in the conversation or corrections
- If there is nothing useful to distill, return an empty candidates array

Categories:
- "do"     — must always do (strong positive instruction)
- "dont"   — must never do (strong negative instruction)
- "prefer" — soft preference / style

Reasoning should cite the specific turn or correction that justifies the rule.`;

  const userPrompt = `EXISTING ACTIVE RULES (don't propose duplicates):
${existingText || '(none)'}

RECENT CONVERSATION (last 50 turns):
${conversation || '(none)'}

UNRESOLVED USER FEEDBACK / CORRECTIONS:
${correctionText || '(none)'}

Distill 1-5 new behavior rules. Output JSON only.`;

  let candidates: CandidateRule[] = [];
  try {
    const resp = await anthropic.messages.create({
      model: pickModel('summary.long'),
      max_tokens: 1200,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = resp.content[0];
    const text = block.type === 'text' ? block.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { candidates?: CandidateRule[] };
      candidates = (parsed.candidates || [])
        .filter((c) => c.rule?.trim() && ['do', 'dont', 'prefer'].includes(c.category))
        .slice(0, 5);
    }
  } catch (err) {
    return Response.json({
      error: 'Reflection failed',
      detail: err instanceof Error ? err.message : 'unknown',
    }, { status: 500 });
  }

  return Response.json({
    candidates,
    reviewed: {
      turns: conversation ? conversation.split('\n\n').length : 0,
      corrections: (corrections ?? []).length,
    },
  });
}
