import { anthropic, MODELS, cachedSystem } from '@/lib/anthropic';

// Static instructions — cached. The dynamic part (book title/author/context) goes in the user message.
const BOOK_SUMMARY_SYSTEM_PROMPT = `You are writing a professional, long-form book summary in the style of Shortform or Headway. The goal is a comprehensive, objective breakdown that helps the reader absorb the book's full argument without reading it cover to cover.

Write as if for a published summary platform — authoritative, well-structured, and informative. Do NOT personalize the main summary to any specific reader. Keep it objective and universally useful.

Return ONLY valid JSON in this exact structure. No markdown, no code fences, no commentary:

{
  "thesis": "One crisp sentence capturing the book's core argument or central claim.",
  "overview": "A 200-300 word objective overview of the book. Cover the author's background and credibility, what problem the book addresses, the main argument and how it's structured, and what makes this book distinct from others on the same topic. Write in flowing prose — no bullet points.",
  "key_ideas": [
    {
      "concept": "Short name for the idea (3-6 words) — a reusable mental model or framework.",
      "explanation": "2-3 sentences explaining the idea in depth. Cover what the author argues, the evidence or reasoning they provide, and why this idea matters in the broader context of the book.",
      "quote": "A real or faithful paraphrase quote from the book that crystallizes this idea."
    }
  ],
  "notable_quotes": [
    "A memorable standalone quote from the book — one that captures the author's voice and philosophy."
  ],
  "counter_arguments": "3-4 sentences on what the book gets wrong, oversimplifies, or where it's weakest. Reference specific criticisms from notable reviewers or the academic community if applicable. Be honest and substantive.",
  "ultra_short": "A 3-sentence TL;DR of the entire book for quick reference.",
  "relevance": "2-3 sentences on why this book matters for leaders and decision-makers. What specific professional challenges does it help with?",
  "action": "One specific, concrete action a reader should start doing after reading this book.",
  "avoidance": "One specific thing a reader should stop doing based on this book's insights."
}

Rules:
- Include exactly 5-7 key ideas.
- Include 3-5 notable_quotes — real or faithfully paraphrased from the book.
- Each "concept" should be a reusable mental model, not a vague theme.
- Each "explanation" should give enough depth that the reader genuinely understands the idea without reading the chapter.
- Each "quote" should feel like the author's voice, not generic.
- "counter_arguments" must be substantive — do not sugar-coat. If the book is widely praised but has known weaknesses, say so.
- "overview" must be objective prose, not a pitch.
- Respond with ONLY the JSON object.`;

const PERSONAL_REVIEW_SYSTEM_PROMPT = `You are writing a personal review layer on top of a book summary for a specific reader.

Write a 150-200 word personal review that:
1. Opens with how the book's thesis connects to ONE specific thing in the reader's current context
2. Picks 2 of the key ideas most relevant to the reader right now and explains why
3. Ends with one concrete thing the reader should do this week

No preamble. No markdown headings. Plain readable prose.`;

export interface BookSummary {
  thesis: string;
  overview: string;
  key_ideas: Array<{
    concept: string;
    explanation: string;
    quote: string;
    // Legacy compat
    when_to_apply?: string;
  }>;
  notable_quotes: string[];
  counter_arguments: string;
  ultra_short: string;
  // Personal section (bottom)
  relevance: string;
  action: string;
  avoidance: string;
  // Legacy compat
  why_it_matters?: string;
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
    ? `\nUser's current context: ${userContext.slice(0, 300)}`
    : '';

  const response = await anthropic.messages.create({
    model: MODELS.smart,
    max_tokens: 4000,
    system: cachedSystem(BOOK_SUMMARY_SYSTEM_PROMPT),
    messages: [{
      role: 'user',
      content: `Book: "${title}" by ${author}${contextLine}`,
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
      system: cachedSystem(PERSONAL_REVIEW_SYSTEM_PROMPT),
      messages: [{
        role: 'user',
        content: `Book: "${book.title}" by ${book.author}\nThesis: ${book.summary.thesis}\n\nReader context:\n${userContext.slice(0, 800)}`,
      }],
    });

    return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  } catch {
    return '';
  }
}
