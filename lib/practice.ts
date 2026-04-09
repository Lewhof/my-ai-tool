import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS, cachedSystem } from '@/lib/anthropic';

// Static system prompt — cached via prompt caching.
// Hit daily (morning content cron) → break-even on 1 hit.
const PRACTICE_SYSTEM_PROMPT = `You are crafting a daily morning reflection for a Stoic-leaning reader (COO / entrepreneur).

Write a 180-220 word morning reflection in this structure:
1. A short, real quote or paraphrase attributed to the featured thinker that touches on the week's virtue.
2. Two short paragraphs unpacking how this applies to a modern operator's day — practical, not academic.
3. End with a single reflection question (1 line) starting with "Ask yourself:".

No markdown headings. No emojis. Plain readable prose. No preamble like "Here is" or "Sure!". Just the reflection.`;

/**
 * Default 13 virtues — Stoic cardinal + modern.
 * Used to seed virtue_definitions on first visit.
 */
export const DEFAULT_VIRTUES: Array<{ name: string; description: string }> = [
  { name: 'Wisdom', description: 'Sound judgment. Knowing what matters and what does not.' },
  { name: 'Justice', description: 'Treating others fairly. Doing right by those in your life.' },
  { name: 'Courage', description: 'Facing fear, discomfort, and uncertainty with action.' },
  { name: 'Temperance', description: 'Self-control. Moderation in appetite, speech, and emotion.' },
  { name: 'Focus', description: 'Deep, sustained attention on what truly matters.' },
  { name: 'Patience', description: 'Enduring without frustration. Trusting the process.' },
  { name: 'Gratitude', description: 'Seeing and acknowledging the good already present.' },
  { name: 'Humility', description: 'Knowing your place. Accepting that you do not know everything.' },
  { name: 'Empathy', description: 'Understanding others from their own perspective.' },
  { name: 'Integrity', description: 'Alignment between values, words, and actions.' },
  { name: 'Discipline', description: 'Doing what must be done, whether you feel like it or not.' },
  { name: 'Presence', description: 'Being fully here. Not rehearsing the past or rehearsing the future.' },
  { name: 'Generosity', description: 'Giving freely. Time, attention, money, credit.' },
];

/**
 * Rotating thinkers — a Stoic-weighted mix of classical and modern voices.
 * The daily content generator picks from this pool based on the weekly virtue.
 */
export const THINKERS = [
  // Classical Stoic (40% weight)
  { name: 'Marcus Aurelius', school: 'Stoic', focus: 'duty, impermanence, reason' },
  { name: 'Seneca', school: 'Stoic', focus: 'time, friendship, composure under pressure' },
  { name: 'Epictetus', school: 'Stoic', focus: 'control, perception, discipline' },
  { name: 'Musonius Rufus', school: 'Stoic', focus: 'practice, self-mastery' },
  // Modern Stoic-adjacent
  { name: 'Ryan Holiday', school: 'Modern Stoic', focus: 'obstacle as way, ego, stillness' },
  // Buddhism & Taoism
  { name: 'Lao Tzu', school: 'Taoist', focus: 'wu-wei, simplicity, yielding' },
  { name: 'Thich Nhat Hanh', school: 'Buddhist', focus: 'presence, mindfulness, peace' },
  // Modern thinkers
  { name: 'Naval Ravikant', school: 'Modern', focus: 'leverage, clarity, long games' },
  { name: 'Nassim Taleb', school: 'Modern', focus: 'antifragility, skin in the game' },
  { name: 'Cal Newport', school: 'Modern', focus: 'deep work, digital minimalism' },
  { name: 'James Clear', school: 'Modern', focus: 'systems, identity-based habits' },
  { name: 'Derek Sivers', school: 'Modern', focus: 'useful not true, essentialism' },
  { name: 'Viktor Frankl', school: 'Modern', focus: 'meaning, suffering, choice' },
];

/**
 * Given a date, return the ISO date of the Monday of that week.
 */
export function getWeekOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/**
 * Calculate which virtue is active this week based on rotation.
 * Uses ISO week number modulo the number of active virtues.
 */
export function getCurrentVirtue(virtues: Array<{ name: string; position: number }>, date: Date = new Date()): { name: string; position: number } | null {
  if (virtues.length === 0) return null;
  const sorted = [...virtues].sort((a, b) => a.position - b.position);

  // ISO week number
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return sorted[(weekNum - 1) % sorted.length];
}

/**
 * Ensure the user has the 13 default virtues seeded.
 */
export async function ensureDefaultVirtues(userId: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('virtue_definitions')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (existing && existing.length > 0) return;

  const rows = DEFAULT_VIRTUES.map((v, i) => ({
    user_id: userId,
    name: v.name,
    description: v.description,
    position: i + 1,
    is_custom: false,
    active: true,
  }));

  await supabaseAdmin.from('virtue_definitions').insert(rows);
}

/**
 * Get today's daily practice content (morning + evening).
 * Generates via AI if not cached. Cached per user+date in practice_daily.
 */
export async function getDailyContent(userId: string, date: string): Promise<{
  week_theme: string;
  morning_content: string;
  evening_content: string;
  morning_response?: unknown;
  evening_response?: unknown;
  morning_completed_at?: string;
  evening_completed_at?: string;
}> {
  // Check cache
  const { data: cached } = await supabaseAdmin
    .from('practice_daily')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (cached && cached.morning_content) {
    return {
      week_theme: cached.week_theme || '',
      morning_content: cached.morning_content || '',
      evening_content: cached.evening_content || '',
      morning_response: cached.morning_response,
      evening_response: cached.evening_response,
      morning_completed_at: cached.morning_completed_at,
      evening_completed_at: cached.evening_completed_at,
    };
  }

  // Ensure defaults are seeded
  await ensureDefaultVirtues(userId);

  // Get current virtue
  const { data: virtues } = await supabaseAdmin
    .from('virtue_definitions')
    .select('name, position')
    .eq('user_id', userId)
    .eq('active', true);

  const currentVirtue = getCurrentVirtue(virtues ?? [], new Date(date + 'T12:00:00'));
  const virtueName = currentVirtue?.name || 'Wisdom';

  // Pick a rotating thinker — day-of-year modulo thinker count
  const dayOfYear = Math.floor((new Date(date + 'T12:00:00').getTime() - new Date(new Date(date + 'T12:00:00').getFullYear(), 0, 0).getTime()) / 86400000);
  const thinker = THINKERS[dayOfYear % THINKERS.length];

  // Generate morning content via AI
  const morning = await generateMorningContent(virtueName, thinker.name, thinker.school);
  const evening = buildEveningPrompts(virtueName);

  // Cache it
  await supabaseAdmin.from('practice_daily').upsert({
    user_id: userId,
    date,
    week_theme: virtueName,
    morning_content: morning,
    evening_content: evening,
  }, { onConflict: 'user_id,date' });

  return {
    week_theme: virtueName,
    morning_content: morning,
    evening_content: evening,
  };
}

async function generateMorningContent(virtue: string, thinkerName: string, thinkerSchool: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 400,
      system: cachedSystem(PRACTICE_SYSTEM_PROMPT),
      messages: [{
        role: 'user',
        content: `This week's virtue: ${virtue}\nToday's featured thinker: ${thinkerName} (${thinkerSchool})\n\nWrite today's reflection.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return text || fallbackMorning(virtue, thinkerName);
  } catch {
    return fallbackMorning(virtue, thinkerName);
  }
}

function fallbackMorning(virtue: string, thinker: string): string {
  return `Today's virtue is ${virtue}.

Drawing on the tradition of ${thinker}, consider that the ancients saw virtue not as an abstract ideal but as the shape of daily action. ${virtue} is practiced in the small decisions — how you answer an email, how you wait in a queue, how you respond to an interruption.

You will be tested on this virtue today, probably without warning. That's how the practice works.

Ask yourself: Where will I be most tempted to abandon ${virtue.toLowerCase()} today, and how will I stay with it?`;
}

function buildEveningPrompts(virtue: string): string {
  return `The Stoic evening review — Seneca's method. Three questions, practiced for over 2,000 years.

1. What did I do well today?
2. Where did I fall short?
3. What will I do differently tomorrow?

Focus your reflection on ${virtue} — this week's virtue. Where did you embody it? Where did you drift from it?

Be honest, not harsh. The point is examination, not judgement.`;
}
