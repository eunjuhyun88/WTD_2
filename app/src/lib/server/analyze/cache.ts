import { getSharedCache, setSharedCache } from '$lib/server/sharedCache';

const ANALYZE_SCOPE = 'analyze-route';
const ANALYZE_TTL_MS = 7_000;

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function buildAnalyzeCacheKey(symbol: string, tf: string): string {
  return `${normalizeSymbol(symbol)}:${tf.trim().toLowerCase()}`;
}

export async function getAnalyzeCachedResponse<T>(cacheKey: string): Promise<T | null> {
  return getSharedCache<T>(ANALYZE_SCOPE, cacheKey);
}

export async function setAnalyzeCachedResponse<T>(cacheKey: string, payload: T): Promise<void> {
  await setSharedCache<T>(ANALYZE_SCOPE, cacheKey, payload, ANALYZE_TTL_MS);
}
