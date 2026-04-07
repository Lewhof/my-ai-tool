import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Get all active whiteboard items
  const { data: items } = await supabaseAdmin
    .from('whiteboard')
    .select('id, title, description, status, priority, tags, created_at')
    .eq('user_id', userId)
    .neq('status', 'done')
    .neq('status', 'parked');

  if (!items?.length) return Response.json({ message: 'No items to prioritize' });

  const itemList = items.map((i, idx) => `${idx + 1}. [${i.status}] "${i.title}" — ${i.description?.slice(0, 100) || 'no description'} (tags: ${(i.tags as string[]).join(', ') || 'none'}, created: ${new Date(i.created_at).toLocaleDateString()})`).join('\n');

  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Prioritize these whiteboard items by urgency, impact, and effort. Return ONLY a JSON array of objects with "index" (1-based from the list) and "priority" (1 = highest, ascending). Also add "reason" (1 sentence why).

Items:
${itemList}

Respond with ONLY valid JSON: [{"index": 1, "priority": 1, "reason": "..."}, ...]`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON found');

    const priorities = JSON.parse(jsonMatch[0]) as Array<{ index: number; priority: number; reason: string }>;

    // Update each item's priority
    const results = [];
    for (const p of priorities) {
      const item = items[p.index - 1];
      if (!item) continue;

      await supabaseAdmin
        .from('whiteboard')
        .update({ priority: p.priority })
        .eq('id', item.id);

      results.push({ title: item.title, priority: p.priority, reason: p.reason });
    }

    return Response.json({ prioritized: results });
  } catch {
    return Response.json({ error: 'AI could not prioritize items', raw: text }, { status: 500 });
  }
}
