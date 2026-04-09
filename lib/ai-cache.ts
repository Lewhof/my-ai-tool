/**
 * Phase 4.2 Tier 1 — Exact-match response caching for stateless AI classifications.
 *
 * This is NOT semantic caching. It hashes the normalized input string and stores
 * the full response. Only appropriate for stateless, deterministic AI calls where
 * identical normalized inputs should produce identical outputs:
 *   - Search query expansion (synonym generation)
 *   - Quick-capture text classification (task/note/kb/whiteboard)
 *   - Web clip classification (kb/book/highlight/task/whiteboard/note)
 *
 * DO NOT use for:
 *   - Anything that depends on user DB state (tasks, calendar, finances)
 *   - Conversational/stateful calls (Cerebro agent)
 *   - Time-sensitive calls (briefing, daily reflection)
 *   - User-unique inputs (book summaries, email drafts, vision parsing)
 *
 * Cache is fail-open — if lookup or store fails, the AI call proceeds normally.
 */

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Cache scopes — used for telemetry and scoped invalidation.
 * Add new scopes here as more call sites adopt caching.
 */
export type CacheScope =
  | 'search.expand'      // AI search query expansion (synonyms)
  | 'quick-capture'       // Cmd+K input classification
  | 'clip.classify';      // Web clip content routing

/**
 * Normalize and hash an input for cache lookup.
 * Strings are lowercased, whitespace-collapsed, and trimmed.
 * Objects are JSON-serialized with stable key ordering.
 */
export function hashInput(input: string | Record<string, unknown>): string {
  let normalized: string;
  if (typeof input === 'string') {
    normalized = input.toLowerCase().replace(/\s+/g, ' ').trim();
  } else {
    // Stable stringify by sorting keys
    const sortedKeys = Object.keys(input).sort();
    const sorted: Record<string, unknown> = {};
    for (const k of sortedKeys) sorted[k] = input[k];
    normalized = JSON.stringify(sorted);
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Look up a cached response. Returns null on miss, error, or expiry.
 * Silently increments hit_count on hit (fire-and-forget).
 */
export async function getCached<T>(scope: CacheScope, key: string): Promise<T | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cached_responses')
      .select('id, response, hit_count')
      .eq('cache_key', key)
      .eq('scope', scope)
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;

    // Fire-and-forget hit counter increment — do not await
    supabaseAdmin
      .from('cached_responses')
      .update({ hit_count: (data.hit_count ?? 0) + 1 })
      .eq('id', data.id)
      .then(() => {}, () => {});

    return data.response as T;
  } catch {
    // Fail-open: cache errors should never block the AI call
    return null;
  }
}

/**
 * Store a response in the cache.
 * ttlSeconds is mandatory — forces the caller to think about freshness.
 */
export async function setCached(
  scope: CacheScope,
  key: string,
  response: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    const expires_at = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await supabaseAdmin
      .from('cached_responses')
      .upsert(
        {
          cache_key: key,
          scope,
          response,
          expires_at,
          hit_count: 0,
        },
        { onConflict: 'cache_key' }
      );
  } catch {
    // Fail-open
  }
}

/**
 * Get cache statistics for telemetry.
 * Returns per-scope counts and hit rates.
 */
export async function getCacheStats(): Promise<Array<{
  scope: string;
  entries: number;
  total_hits: number;
  avg_hits_per_entry: number;
  oldest_entry: string | null;
  newest_entry: string | null;
}>> {
  try {
    const { data } = await supabaseAdmin
      .from('cached_responses')
      .select('scope, hit_count, created_at')
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) return [];

    const byScope: Record<string, { entries: number; total_hits: number; oldest: string; newest: string }> = {};
    for (const row of data) {
      const s = row.scope;
      if (!byScope[s]) {
        byScope[s] = { entries: 0, total_hits: 0, oldest: row.created_at, newest: row.created_at };
      }
      byScope[s].entries++;
      byScope[s].total_hits += row.hit_count ?? 0;
      if (row.created_at < byScope[s].oldest) byScope[s].oldest = row.created_at;
      if (row.created_at > byScope[s].newest) byScope[s].newest = row.created_at;
    }

    return Object.entries(byScope).map(([scope, stats]) => ({
      scope,
      entries: stats.entries,
      total_hits: stats.total_hits,
      avg_hits_per_entry: stats.entries > 0 ? stats.total_hits / stats.entries : 0,
      oldest_entry: stats.oldest,
      newest_entry: stats.newest,
    }));
  } catch {
    return [];
  }
}

/**
 * Purge expired entries. Safe to call from cron.
 */
export async function purgeExpired(): Promise<number> {
  try {
    const { data } = await supabaseAdmin
      .from('cached_responses')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}
