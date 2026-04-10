import { auth } from '@clerk/nextjs/server';

export const revalidate = 900; // ISR: revalidate every 15 min

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  description: string;
}

// In-memory cache (15 min TTL)
let cache: { articles: NewsArticle[]; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

const FEEDS: Record<string, string> = {
  top:      'https://news.google.com/rss?hl=en-ZA&gl=ZA&ceid=ZA:en',
  business: 'https://news.google.com/rss/search?q=business+south+africa&hl=en-ZA&gl=ZA&ceid=ZA:en',
  tech:     'https://news.google.com/rss/search?q=technology&hl=en-ZA&gl=ZA&ceid=ZA:en',
  world:    'https://news.google.com/rss/search?q=world+news&hl=en-ZA&gl=ZA&ceid=ZA:en',
};

function parseRss(xml: string): NewsArticle[] {
  const items: NewsArticle[] = [];

  // Match <item>...</item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>([\s\S]*?)<\/title>/)?.[1]
      ?? '';
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '';
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '';
    const desc = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]
      ?? block.match(/<description>([\s\S]*?)<\/description>/)?.[1]
      ?? '';
    const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? '';

    // Google News appends " - Source" to titles — strip it
    const cleanTitle = source ? title.replace(new RegExp(`\\s*-\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '') : title;
    // Strip HTML tags from description
    const cleanDesc = desc.replace(/<[^>]+>/g, '').trim();

    if (cleanTitle) {
      items.push({
        id: Buffer.from(link || cleanTitle).toString('base64').slice(0, 20),
        title: decodeHtmlEntities(cleanTitle),
        source: decodeHtmlEntities(source),
        url: link.trim(),
        publishedAt: pubDate,
        description: decodeHtmlEntities(cleanDesc).slice(0, 200),
      });
    }
  }

  return items;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get('category') || 'top';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 40);

  // Check cache (only for "top" — other categories fetched fresh)
  if (category === 'top' && cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json({ articles: cache.articles.slice(0, limit), cached: true });
  }

  const feedUrl = FEEDS[category] || FEEDS.top;

  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LewhofApp/1.0)',
      },
      next: { revalidate: 900 },
    });

    if (!res.ok) {
      return Response.json({ error: 'Failed to fetch news feed', status: res.status }, { status: 502 });
    }

    const xml = await res.text();
    const articles = parseRss(xml).slice(0, limit);

    // Cache top stories
    if (category === 'top') {
      cache = { articles, ts: Date.now() };
    }

    return Response.json({ articles, cached: false });
  } catch (err) {
    console.error('[news] fetch failed:', err);
    // Return stale cache if available
    if (cache) {
      return Response.json({ articles: cache.articles.slice(0, limit), cached: true, stale: true });
    }
    return Response.json({ error: 'News feed unavailable' }, { status: 502 });
  }
}
