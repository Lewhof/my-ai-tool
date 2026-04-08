import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

// GET: Load or generate tone profile
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // Check for cached profile
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('tone_profile')
    .eq('user_id', userId)
    .single();

  if (settings?.tone_profile) {
    return Response.json({ profile: settings.tone_profile, cached: true });
  }

  // Generate from message history
  const profile = await generateToneProfile(userId);
  return Response.json({ profile, cached: false });
}

// POST: Force regenerate tone profile
export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const profile = await generateToneProfile(userId);
  return Response.json({ profile });
}

async function generateToneProfile(userId: string) {
  // Get last 100 user messages
  const { data: messages } = await supabaseAdmin
    .from('chat_messages')
    .select('content, created_at')
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(100);

  // Filter to messages from this user's threads
  const { data: threads } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('user_id', userId);

  const threadIds = new Set((threads ?? []).map(t => t.id));

  // Also grab notes for writing style
  const { data: notes } = await supabaseAdmin
    .from('notes_v2')
    .select('content')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10);

  const userMessages = (messages ?? []).map(m => m.content).filter(c => c && c.length > 10);
  const noteContent = (notes ?? []).map(n => n.content).filter(Boolean).join('\n---\n').slice(0, 2000);

  if (userMessages.length < 5) {
    const fallback = {
      tone: 'professional',
      formality: 'semi-formal',
      avg_length: 'medium',
      style_notes: 'Not enough data yet. Will refine as more messages are sent.',
      vocabulary: [],
      patterns: [],
    };
    return fallback;
  }

  const sample = userMessages.slice(0, 50).join('\n---\n').slice(0, 4000);

  const response = await anthropic.messages.create({
    model: MODELS.smart,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Analyze this person's writing style from their messages and notes. Build a writing profile.

Messages (most recent first):
${sample}

${noteContent ? `Notes:\n${noteContent.slice(0, 1000)}` : ''}

Return ONLY valid JSON with this structure:
{
  "tone": "professional|casual|direct|warm|formal",
  "formality": "formal|semi-formal|casual|very-casual",
  "avg_length": "brief|medium|detailed",
  "style_notes": "2-3 sentences describing their unique voice, quirks, patterns",
  "vocabulary": ["words/phrases they use often"],
  "patterns": ["structural patterns like bullet points, questions, exclamations"],
  "greeting_style": "how they typically start messages",
  "closing_style": "how they typically end messages"
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const profile = JSON.parse(jsonMatch[0]);

    // Cache in user_settings
    await supabaseAdmin
      .from('user_settings')
      .update({ tone_profile: profile })
      .eq('user_id', userId);

    return profile;
  } catch {
    return { tone: 'professional', formality: 'semi-formal', avg_length: 'medium', style_notes: 'Could not analyze', vocabulary: [], patterns: [] };
  }
}
