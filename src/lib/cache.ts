/**
 * Simple in-memory LRU cache for AI responses.
 * Avoids duplicate API calls for identical requests.
 * Entries expire after TTL_MS to keep data fresh.
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 100;

export function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key: string, data: any): void {
  // Evict oldest if at capacity
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

export function cacheKey(...parts: string[]): string {
  return parts.join("|");
}

export function deleteCache(key: string): void {
  cache.delete(key);
}
