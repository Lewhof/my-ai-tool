'use client';

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'lewhof-offline';
const DB_VERSION = 1;

interface SyncQueueItem {
  id: string;
  url: string;
  method: string;
  body: string;
  timestamp: number;
}

interface CachedData {
  key: string;
  data: unknown;
  timestamp: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Sync queue for offline mutations
        if (!db.objectStoreNames.contains('sync-queue')) {
          db.createObjectStore('sync-queue', { keyPath: 'id' });
        }
        // Cached API responses
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ── Cache API responses ──
export async function cacheData(key: string, data: unknown) {
  const db = await getDB();
  await db.put('cache', { key, data, timestamp: Date.now() } as CachedData);
}

export async function getCachedData<T>(key: string, maxAgeMs = 30 * 60 * 1000): Promise<T | null> {
  try {
    const db = await getDB();
    const entry = await db.get('cache', key) as CachedData | undefined;
    if (!entry) return null;
    if (Date.now() - entry.timestamp > maxAgeMs) return null;
    return entry.data as T;
  } catch {
    return null;
  }
}

// ── Sync queue for offline mutations ──
export async function addToSyncQueue(url: string, method: string, body: unknown) {
  const db = await getDB();
  const item: SyncQueueItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    method,
    body: JSON.stringify(body),
    timestamp: Date.now(),
  };
  await db.put('sync-queue', item);
  return item.id;
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAll('sync-queue');
}

export async function removeFromSyncQueue(id: string) {
  const db = await getDB();
  await db.delete('sync-queue', id);
}

export async function processSyncQueue(): Promise<{ processed: number; failed: number }> {
  const queue = await getSyncQueue();
  let processed = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body,
      });
      if (res.ok) {
        await removeFromSyncQueue(item.id);
        processed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}

// ── Offline-aware fetch wrapper ──
export async function offlineFetch<T>(
  url: string,
  options?: { cacheKey?: string; maxAge?: number }
): Promise<T | null> {
  const cacheKey = options?.cacheKey || url;

  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      // Cache successful responses
      await cacheData(cacheKey, data);
      return data as T;
    }
    // If fetch fails, try cache
    return getCachedData<T>(cacheKey, options?.maxAge);
  } catch {
    // Offline — return cached data
    return getCachedData<T>(cacheKey, options?.maxAge);
  }
}
