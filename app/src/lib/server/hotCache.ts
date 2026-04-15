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
