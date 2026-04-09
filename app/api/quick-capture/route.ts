import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { getCached, setCached, hashInput } from '@/lib/ai-cache';

const QUICK_CAPTURE_TTL = 30 * 24 * 60 * 60; // 30 days — short classification phrases repeat often

// Detect inputs containing relative date words. These are skipped from cache
// because "call mom tomorrow" resolves to a different date each time you say it.
const RELATIVE_DATE_REGEX = /\b(today|tomorrow|yesterday|tonight|tmrw|tmr|next\s+(week|month|year|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in\s+\d+\s+(day|week|month|hour|min))\b/i;

interface ClassifyResult {
  type: 'todo' | 'note' | 'kb' | 'calendar' | 'whiteboard';
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  category?: string;
  tags?: string[];
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { input } = await req.json();
  if (!input?.trim()) return Response.json({ error: 'Input required' }, { status: 400 });

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

  // Cache check — only if input doesn't contain relative date words
  const hasRelativeDate = RELATIVE_DATE_REGEX.test(input);
  const cacheKey = hashInput(input);
  let classified: ClassifyResult | null = null;

  if (!hasRelativeDate) {
    const cachedResult = await getCached<ClassifyResult>('quick-capture', cacheKey);
    if (cachedResult) classified = cachedResult;
  }

  // AI call on cache miss
  if (!classified) {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Classify this user input and extract structured data. Today is ${today}.

Input: "${input}"

Return ONLY valid JSON with these fields:
- "type": one of "todo", "note", "kb", "whiteboard"
- "title": clean title (max 80 chars)
- "description": optional detail if input is long
- "priority": for todos only — "urgent", "high", "medium", or "low"
- "due_date": ISO date if mentioned (e.g. "tomorrow" = "${tomorrow}", "today" = "${today}")
- "category": for kb only — "General", "Reference", "How-To", "Decisions"
- "tags": array of relevant tags (max 3)

Classification rules:
- Action items, reminders, deadlines → "todo"
- Quick thoughts, meeting notes, journal entries → "note"
- Facts, definitions, references, technical info → "kb"
- Feature ideas, bugs, improvements for the app → "whiteboard"

Respond with ONLY the JSON object.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'Could not classify input', raw: text }, { status: 500 });
    classified = JSON.parse(jsonMatch[0]) as ClassifyResult;

    // Store in cache only if input doesn't reference relative dates
    if (!hasRelativeDate) {
      await setCached('quick-capture', cacheKey, classified, QUICK_CAPTURE_TTL);
    }
  }

  try {

    // Create the item in the appropriate table
    let created: { id: string; type: string; title: string } | null = null;

    switch (classified.type) {
      case 'todo': {
        const { data } = await supabaseAdmin
          .from('todos')
          .insert({
            user_id: userId,
            title: classified.title,
            description: classified.description || null,
            status: 'todo',
            priority: classified.priority || 'medium',
            due_date: classified.due_date || null,
            bucket: 'General',
            tags: classified.tags || [],
          })
          .select('id')
          .single();
        created = { id: data?.id, type: 'todo', title: classified.title };
        break;
      }

      case 'note': {
        const { data } = await supabaseAdmin
          .from('notes_v2')
          .insert({
            user_id: userId,
            title: classified.title,
            content: classified.description || input,
            images: [],
          })
          .select('id')
          .single();
        created = { id: data?.id, type: 'note', title: classified.title };
        break;
      }

      case 'kb': {
        const { data } = await supabaseAdmin
          .from('knowledge_base')
          .insert({
            user_id: userId,
            title: classified.title,
            content: classified.description || input,
            category: classified.category || 'General',
            tags: classified.tags || [],
          })
          .select('id')
          .single();
        created = { id: data?.id, type: 'kb', title: classified.title };
        break;
      }

      case 'whiteboard': {
        const { data } = await supabaseAdmin
          .from('whiteboard')
          .insert({
            user_id: userId,
            title: classified.title,
            description: classified.description || null,
            status: 'idea',
            priority: 99,
            tags: classified.tags || [],
          })
          .select('id')
          .single();
        created = { id: data?.id, type: 'whiteboard', title: classified.title };
        break;
      }
    }

    return Response.json({
      created,
      classified: {
        type: classified.type,
        title: classified.title,
        due_date: classified.due_date,
        priority: classified.priority,
      },
    });
  } catch (err) {
    return Response.json({
      error: 'Failed to create item',
      detail: err instanceof Error ? err.message : 'unknown',
    }, { status: 500 });
  }
}
