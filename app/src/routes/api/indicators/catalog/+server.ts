// ═══════════════════════════════════════════════════════════════
// W-0400 Phase 2B — Indicator Catalog Proxy
// ═══════════════════════════════════════════════════════════════
//
// Proxies engine GET /indicators/catalog to client.
// Module-level 5-min cache avoids hammering the engine for catalog data.
//
// GET /api/indicators/catalog
//   → { indicators: [...], count: int }

import { json, type RequestHandler } from '@sveltejs/kit';
import { engineFetch } from '$lib/server/engineTransport';

// ── In-memory cache (5 min TTL) ─────────────────────────────────────────────
interface CatalogCache {
  data: unknown;
  fetchedAt: number;
}

const catalogCache = new Map<string, CatalogCache>();
const CACHE_TTL = 5 * 60_000;

export const GET: RequestHandler = async () => {
  const cacheKey = 'catalog';
  const cached = catalogCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return json(cached.data, { headers: { 'X-Cache': 'HIT' } });
  }

  try {
    const res = await engineFetch('/indicators/catalog');
    if (!res.ok) {
      // If we have stale data, serve it rather than failing
      if (cached) {
        return json(cached.data, { headers: { 'X-Cache': 'STALE' } });
      }
      return json(
        { error: 'engine_unavailable', cached: false },
        { status: 503 },
      );
    }
    const data: unknown = await res.json();
    catalogCache.set(cacheKey, { data, fetchedAt: Date.now() });
    return json(data, { headers: { 'X-Cache': 'MISS' } });
  } catch {
    if (cached) {
      return json(cached.data, { headers: { 'X-Cache': 'STALE' } });
    }
    return json(
      { error: 'engine_unavailable', cached: false },
      { status: 503 },
    );
  }
};
