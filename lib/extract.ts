import { supabaseAdmin } from '@/lib/supabase-server';
import crypto from 'crypto';

export interface ExtractedArticle {
  url: string;
  canonical_url: string;
  title: string;
  byline: string;
  content: string;       // clean text (no HTML)
  excerpt: string;       // short summary
  site: string;          // domain
  og_image: string | null;
  word_count: number;
  cached: boolean;
  extracted: boolean;    // true if Readability succeeded; false if minimal fallback
}

/**
 * Canonicalize a URL for caching — strip tracking params, sort query, lowercase host.
 */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    // Strip tracking params
    const drop = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src', 'ref_url',
      '_ga', '_gl', 'igshid', 'trk', 'trkCampaign',
    ];
    drop.forEach(k => u.searchParams.delete(k));
    // Sort query params for consistent hashing
    const sorted = new URLSearchParams([...u.searchParams.entries()].sort());
    u.search = sorted.toString();
    // Drop trailing slash
    let out = u.toString();
    if (out.endsWith('/') && u.pathname.length > 1) out = out.slice(0, -1);
    return out;
  } catch {
    return raw;
  }
}

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Fetch a URL and extract its main content using Mozilla Readability.
 * Caches results in the url_cache table.
 */
export async function extractArticle(rawUrl: string): Promise<ExtractedArticle> {
  const canonical = canonicalizeUrl(rawUrl);
  const urlHash = hashUrl(canonical);

  // 1. Check cache
  const { data: cached } = await supabaseAdmin
    .from('url_cache')
    .select('*')
    .eq('url_hash', urlHash)
    .maybeSingle();

  if (cached) {
    const expired = cached.expires_at && new Date(cached.expires_at) < new Date();
    if (!expired) {
      return {
        url: cached.url,
        canonical_url: canonical,
        title: cached.title || '',
        byline: cached.byline || '',
        content: cached.content || '',
        excerpt: cached.excerpt || '',
        site: cached.site || extractDomain(canonical),
        og_image: cached.og_image || null,
        word_count: cached.word_count || 0,
        cached: true,
        extracted: true,
      };
    }
  }

  // 2. Fetch the URL
  let html = '';
  try {
    const res = await fetch(canonical, {
      headers: {
        // Use a realistic user agent — some sites 403 default Node fetch
        'User-Agent': 'Mozilla/5.0 (compatible; LewhofAI-Clipper/1.0; +https://lewhofmeyr.co.za)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      // 10 second timeout
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    // Fetch failed — return minimal stub
    return {
      url: canonical,
      canonical_url: canonical,
      title: extractDomain(canonical),
      byline: '',
      content: '',
      excerpt: `Failed to fetch: ${err instanceof Error ? err.message : 'unknown'}`,
      site: extractDomain(canonical),
      og_image: null,
      word_count: 0,
      cached: false,
      extracted: false,
    };
  }

  // 3. Extract with Readability + JSDOM
  let title = '';
  let byline = '';
  let content = '';
  let excerpt = '';
  let og_image: string | null = null;
  let extracted = false;

  try {
    // Dynamic imports — these are heavy, only load when needed
    const { JSDOM } = await import('jsdom');
    const { Readability } = await import('@mozilla/readability');

    const dom = new JSDOM(html, { url: canonical });
    const doc = dom.window.document;

    // Pull og:image before Readability strips meta tags
    const ogImageMeta = doc.querySelector('meta[property="og:image"]') || doc.querySelector('meta[name="og:image"]');
    og_image = ogImageMeta?.getAttribute('content') || null;

    const reader = new Readability(doc);
    const article = reader.parse();

    if (article) {
      title = article.title || '';
      byline = article.byline || '';
      // textContent is clean plain text — strip excess whitespace
      content = (article.textContent || '').replace(/\s+/g, ' ').trim();
      excerpt = article.excerpt || content.slice(0, 200);
      extracted = true;
    }
  } catch {
    // JSDOM or Readability failed — fall through to minimal
  }

  // Fallback: title from <title>, content from basic regex if Readability missed
  if (!title || !content) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!title && titleMatch) title = titleMatch[1].trim();
    if (!content) {
      // Strip tags crudely
      content = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000);
    }
    if (!excerpt) excerpt = content.slice(0, 200);
  }

  const word_count = content ? content.split(/\s+/).length : 0;
  const site = extractDomain(canonical);

  // 4. Cache the result
  // News sites: 7 day TTL. Static blogs/docs: forever. Default: 7 days.
  const isNewsy = /\b(news|bloomberg|reuters|cnn|bbc|techcrunch|theverge|forbes|wsj|nyt|guardian)\b/i.test(site);
  const expires_at = isNewsy
    ? new Date(Date.now() + 7 * 86400000).toISOString()
    : null;

  try {
    await supabaseAdmin.from('url_cache').upsert({
      url_hash: urlHash,
      url: canonical,
      title: title.slice(0, 500),
      byline: byline.slice(0, 200),
      content: content.slice(0, 50000),  // cap at 50KB
      excerpt: excerpt.slice(0, 500),
      site,
      og_image,
      word_count,
      expires_at,
    }, { onConflict: 'url_hash' });
  } catch { /* cache write failures are non-fatal */ }

  return {
    url: canonical,
    canonical_url: canonical,
    title,
    byline,
    content,
    excerpt,
    site,
    og_image,
    word_count,
    cached: false,
    extracted,
  };
}

/**
 * Detect book-seller URLs to trigger the book summarization flow.
 */
export function isBookUrl(url: string): boolean {
  const d = extractDomain(url).toLowerCase();
  return (
    d.includes('amazon.') ||
    d === 'goodreads.com' ||
    d === 'www.goodreads.com' ||
    d === 'openlibrary.org' ||
    d.includes('takealot.')
  );
}
