import { anthropic, MODELS } from '@/lib/anthropic';

export interface BookSummary {
  thesis: string;
  why_it_matters: string;
  key_ideas: Array<{
    concept: string;
    quote: string;
    when_to_apply: string;
  }>;
  counter_arguments: string;
  action: string;
  avoidance: string;
  ultra_short: string;
}

export interface BookMetadata {
  title: string;
  author: string;
  isbn?: string;
  cover_url?: string;
}

/**
 * Look up book metadata via Open Library (free, no API key needed).
 */
export async function lookupBookMetadata(query: string): Promise<BookMetadata | null> {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data.docs?.[0];
    if (!doc) return null;

    return {
      title: doc.title || query,
      author: (doc.author_name?.[0]) || 'Unknown',
      isbn: doc.isbn?.[0],
      cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a structured AI summary for a book.
 * Uses Sonnet for quality. Cost: ~$0.15-0.30 per book.
 */
export async function generateBookSummary(
  title: string,
  author: string,
  userContext?: string
): Promise<BookSummary> {
  const contextLine = userContext
    ? `\nThe reader is a COO/entrepreneur. Current context: ${userContext.slice(0, 300)}`
    : '\nThe reader is a COO/entrepreneur — bias "why it matters" and "action" toward operational leverage, team leadership, and long-term decision-making.';

  const response = await anthropic.messages.create({
    model: MODELS.smart,
    max_tokens: 2500,
    messages: [{
      role: 'user',
      content: `You are writing a structured, high-retention summary of a book for a serious reader. Depth over breadth — the goal is metabolized insight, not a shallow sample.

Book: "${title}" by ${author}
${contextLine}

Return ONLY valid JSON in this exact structure. No markdown, no code fences, no commentary:

{
  "thesis": "One crisp sentence capturing the core argument.",
  "why_it_matters": "Two sentences on why this book is worth the reader's time specifically (as a COO/entrepreneur). Be concrete.",
  "key_ideas": [
    {
      "concept": "Short name for the idea (3-6 words)",
      "quote": "A real or faithful paraphrase quote from the book that crystallizes the idea.",
      "when_to_apply": "A specific situation or trigger where this framework fires."
    }
  ],
  "counter_arguments": "2-3 sentences on what the book gets wrong, oversimplifies, or where it's weakest. Be honest.",
  "action": "One specific action to start doing based on this book.",
  "avoidance": "One specific thing to stop doing based on this book.",
  "ultra_short": "A 3-sentence version of the entire summary for spaced-repetition review."
}

Rules:
- Include exactly 5-7 key ideas.
- Each "concept" should be a reusable mental model, not a vague theme.
- Each "quote" should feel like the book's voice, not generic.
- "when_to_apply" must be a concrete situational trigger, not abstract.
- "counter_arguments" must be real — do not sugar-coat. If the book is widely praised but has known weaknesses, say so.
- Respond with ONLY the JSON object.`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI did not return valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate minimum structure
  if (!parsed.thesis || !Array.isArray(parsed.key_ideas) || parsed.key_ideas.length === 0) {
    throw new Error('AI returned incomplete summary structure');
  }

  return parsed as BookSummary;
}

/**
 * Generate a personalized review layer — how this book applies to THIS specific user.
 * Called separately so the generic summary can be cached and reused.
 */
export async function generatePersonalReview(
  book: { title: string; author: string; summary: BookSummary },
  userContext: string
): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: MODELS.smart,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are writing a personal review layer on top of a book summary for a specific reader.

Book: "${book.title}" by ${book.author}
Thesis: ${book.summary.thesis}

Reader context:
${userContext.slice(0, 800)}

Write a 150-200 word personal review that:
1. Opens with how the book's thesis connects to ONE specific thing in the reader's current context
2. Picks 2 of the key ideas most relevant to the reader right now and explains why
3. Ends with one concrete thing the reader should do this week

No preamble. No markdown headings. Plain readable prose.`,
      }],
    });

    return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  } catch {
    return '';
  }
}
