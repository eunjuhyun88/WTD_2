import { createSharedPublicRouteCache, type PublicRouteCacheStatus } from '../publicRouteCache';

const ANALYZE_TTL_MS = 7_000;
const ANALYZE_SCOPE = 'analyze-route';

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function buildAnalyzeCacheKey(symbol: string, tf: string): string {
  return `${normalizeSymbol(symbol)}:${tf.trim().toLowerCase()}`;
}

export const analyzeResponseCache = createSharedPublicRouteCache<Record<string, unknown>>({
  scope: ANALYZE_SCOPE,
  ttlMs: ANALYZE_TTL_MS,
});

export async function getOrRunAnalyzeResponse(
  cacheKey: string,
  builder: () => Promise<Record<string, unknown>>,
): Promise<{ payload: Record<string, unknown>; cacheStatus: PublicRouteCacheStatus }> {
  return analyzeResponseCache.run(cacheKey, builder);
}
