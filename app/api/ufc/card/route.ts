// UFC fight card scraper — fetches from Wikipedia and parses fight card tables
// Uses jsdom to parse HTML tables from UFC event pages

import { JSDOM } from 'jsdom';

interface Bout {
  weightClass: string;
  fighter1: string;
  fighter2: string;
  method: string | null;
  round: string | null;
  time: string | null;
  notes: string | null;
}

interface CardSection {
  name: string;
  bouts: Bout[];
}

interface CachedCard {
  sections: CardSection[];
  ts: number;
}

// In-memory cache (30 min TTL — fight cards don't change often)
const cardCache = new Map<string, CachedCard>();
const CACHE_TTL = 30 * 60 * 1000;

function eventNameToSlug(name: string): string {
  // "UFC 327" → "UFC_327"
  // "UFC Fight Night 279" → "UFC_Fight_Night_279"
  // "UFC Freedom 250" → "UFC_Freedom_250"
  return name.replace(/\s+/g, '_');
}

function cleanText(el: Element | null): string {
  if (!el) return '';
  // Remove superscript reference links like [1], [a]
  const cloned = el.cloneNode(true) as Element;
  cloned.querySelectorAll('sup').forEach(s => s.remove());
  return (cloned.textContent || '').trim();
}

function parseFightCard(html: string): CardSection[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const sections: CardSection[] = [];

  // Wikipedia fight card tables are wikitable class tables
  // Section names come from captions, preceding headings, or bold text
  const tables = doc.querySelectorAll('table.wikitable');

  for (const table of tables) {
    // Check if this is a fight card table by looking at headers
    const headerRow = table.querySelector('tr');
    if (!headerRow) continue;
    const headers = Array.from(headerRow.querySelectorAll('th')).map(th => cleanText(th).toLowerCase());

    // Fight card tables have "weight class" or similar columns and contain "vs." or "def."
    const hasWeightClass = headers.some(h => h.includes('weight') || h.includes('class'));
    const hasMethod = headers.some(h => h.includes('method'));
    if (!hasWeightClass && !hasMethod) continue;

    // Determine section name
    let sectionName = 'Fight Card';

    // Check table caption
    const caption = table.querySelector('caption');
    if (caption) {
      const capText = cleanText(caption);
      if (capText) sectionName = capText;
    } else {
      // Look at preceding sibling or parent for heading
      let prev = table.previousElementSibling;
      while (prev) {
        const tag = prev.tagName.toLowerCase();
        if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
          const headText = cleanText(prev);
          if (headText && !headText.toLowerCase().includes('contents')) {
            sectionName = headText.replace(/\[edit\]/gi, '').trim();
          }
          break;
        }
        // Also check for div wrapping a heading
        const innerH = prev.querySelector('h2, h3, h4');
        if (innerH) {
          const headText = cleanText(innerH);
          if (headText && !headText.toLowerCase().includes('contents')) {
            sectionName = headText.replace(/\[edit\]/gi, '').trim();
          }
          break;
        }
        prev = prev.previousElementSibling;
      }
    }

    // Clean up section name — strip broadcast info in parentheses
    sectionName = sectionName.replace(/\s*\(.*?\)\s*/g, '').trim();
    // Capitalize nicely
    if (sectionName.toLowerCase().includes('main')) sectionName = 'Main Card';
    else if (sectionName.toLowerCase().includes('early')) sectionName = 'Early Prelims';
    else if (sectionName.toLowerCase().includes('prelim')) sectionName = 'Prelims';

    const bouts: Bout[] = [];
    const rows = table.querySelectorAll('tr');

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td, th');
      if (cells.length < 3) continue;

      // Standard Wikipedia fight card columns:
      // Weight class | Fighter 1 | vs/def | Fighter 2 | Method | Round | Time | Notes
      // Sometimes columns merge or differ slightly

      const cellTexts = Array.from(cells).map(c => cleanText(c));

      // Find the "vs." or "def." cell to orient ourselves
      const vsIndex = cellTexts.findIndex(t => /^(vs\.?|def\.?)$/i.test(t));

      let weightClass = '';
      let fighter1 = '';
      let fighter2 = '';
      let method: string | null = null;
      let round: string | null = null;
      let time: string | null = null;
      let notes: string | null = null;

      if (vsIndex >= 1) {
        // Standard layout with vs. separator
        weightClass = cellTexts[0] || '';
        fighter1 = cellTexts[vsIndex - 1] || '';
        fighter2 = cellTexts[vsIndex + 1] || '';
        method = cellTexts[vsIndex + 2] || null;
        round = cellTexts[vsIndex + 3] || null;
        time = cellTexts[vsIndex + 4] || null;
        notes = cellTexts[vsIndex + 5] || null;
        // If weightClass is same as fighter1 (no separate weight column), shift
        if (vsIndex === 1) {
          weightClass = '';
          fighter1 = cellTexts[0];
        }
      } else if (cells.length >= 4) {
        // Fallback: assume weight, f1, f2, method, round, time
        weightClass = cellTexts[0] || '';
        fighter1 = cellTexts[1] || '';
        fighter2 = cellTexts[2] || '';
        method = cellTexts[3] || null;
        round = cellTexts[4] || null;
        time = cellTexts[5] || null;
        notes = cellTexts[6] || null;
      }

      // Skip header-like rows or empty rows
      if (!fighter1 || !fighter2) continue;
      if (fighter1.toLowerCase() === 'fighter' || fighter2.toLowerCase() === 'fighter') continue;

      // Clean up empty method/round/time (Wikipedia uses — for TBD)
      if (method === '—' || method === '') method = null;
      if (round === '—' || round === '') round = null;
      if (time === '—' || time === '') time = null;
      if (notes === '—' || notes === '') notes = null;

      bouts.push({ weightClass, fighter1, fighter2, method, round, time, notes });
    }

    if (bouts.length > 0) {
      sections.push({ name: sectionName, bouts });
    }
  }

  return sections;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  if (!name) {
    return Response.json({ error: 'Event name required' }, { status: 400 });
  }

  // Check cache
  const cacheKey = name.toLowerCase();
  const cached = cardCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return Response.json({ sections: cached.sections });
  }

  const slug = eventNameToSlug(name);
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`;

  try {
    const res = await fetch(wikiUrl, {
      headers: { 'User-Agent': 'LewhofDashboard/1.0 (personal project)' },
    });

    if (!res.ok) {
      return Response.json({ error: 'Event page not found', sections: [] }, { status: 404 });
    }

    const html = await res.text();
    const sections = parseFightCard(html);

    if (sections.length === 0) {
      return Response.json({ error: 'No fight card found', sections: [] });
    }

    // Cache the result
    cardCache.set(cacheKey, { sections, ts: Date.now() });

    return Response.json({ sections });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch fight card';
    return Response.json({ error: msg, sections: [] }, { status: 500 });
  }
}
