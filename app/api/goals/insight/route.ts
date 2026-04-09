import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

interface KeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  status: string;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: string;
  key_results: KeyResult[];
}

// GET: AI-generated insight on current goals progress
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data: goals } = await supabaseAdmin
    .from('goals')
    .select('id, title, description, target_date, status, key_results')
    .eq('user_id', userId)
    .eq('status', 'active');

  const active = (goals ?? []) as Goal[];

  if (active.length === 0) {
    return Response.json({ insight: 'No active goals yet. Create your first objective to start tracking progress.' });
  }

  // Build context
  const now = new Date();
  const context = active.map(g => {
    const daysLeft = g.target_date
      ? Math.ceil((new Date(g.target_date).getTime() - now.getTime()) / 86400000)
      : null;
    const krs = Array.isArray(g.key_results) ? g.key_results : [];
    const krLines = krs.map(kr => {
      const pct = kr.target > 0 ? Math.round((kr.current / kr.target) * 100) : 0;
      return `  - ${kr.title}: ${kr.current}/${kr.target} ${kr.unit} (${pct}%)`;
    }).join('\n') || '  (no key results)';
    return `${g.title}${daysLeft !== null ? ` — ${daysLeft} days left` : ''}\n${krLines}`;
  }).join('\n\n');

  // Fallback summary if AI fails
  const totalKRs = active.reduce((sum, g) => sum + (Array.isArray(g.key_results) ? g.key_results.length : 0), 0);
  const completedKRs = active.reduce((sum, g) => {
    const krs = Array.isArray(g.key_results) ? g.key_results : [];
    return sum + krs.filter(kr => kr.target > 0 && kr.current >= kr.target).length;
  }, 0);
  const fallback = `${active.length} active objective${active.length !== 1 ? 's' : ''} with ${completedKRs}/${totalKRs} key results completed.`;

  try {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 180,
      messages: [{
        role: 'user',
        content: `You are a personal AI chief of staff. Give ONE concise insight (1-2 sentences max) about these OKRs. Highlight what's on track, what's at risk, and the single most important action. Be specific with numbers.

Active Objectives:
${context}

Return ONLY the insight text, no markdown or formatting.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : fallback;
    return Response.json({ insight: text });
  } catch {
    return Response.json({ insight: fallback });
  }
}
