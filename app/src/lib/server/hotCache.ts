type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const valueCache = new Map<string, CacheEntry<unknown>>();
const inFlightCache = new Map<string, Promise<unknown>>();

function pruneExpiredEntries(now: number) {
  for (const [key, entry] of valueCache.entries()) {
    if (entry.expiresAt <= now) valueCache.delete(key);
  }
}

// Background cleanup every 5 minutes to prevent unbounded memory growth.
// Without this, stale entries accumulate at ~200B each with no eviction.
const _cleanupTimer = setInterval(() => pruneExpiredEntries(Date.now()), 5 * 60 * 1000);
if (_cleanupTimer && typeof _cleanupTimer === 'object' && 'unref' in _cleanupTimer) {
  (_cleanupTimer as NodeJS.Timeout).unref();
}

export async function getHotCached<T>(key: string, ttlMs: number, producer: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = valueCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;

  const existing = inFlightCache.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = producer()
    .then((value) => {
      valueCache.set(key, {
        expiresAt: now + ttlMs,
        value,
      });
      pruneExpiredEntries(now);
      return value;
    })
    .finally(() => {
      inFlightCache.delete(key);
    });

  inFlightCache.set(key, promise);
  return promise;
}
