/**
 * GET /api/confluence/current?symbol=BTCUSDT&tf=4h
 *
 * W-0122 — Confluence Engine (Phase 1, app-side heuristic composition).
 *
 * Aggregates the existing W-0122 feeds into one directional score with a
 * contribution breakdown. Fetches in parallel, tolerates any individual
 * upstream failure (missing pillar just reduces confidence instead of
 * breaking the call).
 *
 * Cache: 30 s — Confluence should track candle-close cadence and moves with
 * the underlying data. Server cache is a guard against stampede.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { computeConfluence } from '$lib/confluence/score';
import type { ConfluenceInput } from '$lib/confluence/score';
import type { ConfluenceResult } from '$lib/confluence/types';
import { getAnalyzePayload } from '$lib/server/analyze/service';
import { pushConfluence, streakBack } from '$lib/server/confluenceHistory';
import { adaptEngineFactConfluence } from '$lib/server/confluence/engineFactAdapter';
import { fetchFactConfluenceProxy } from '$lib/server/enginePlanes/facts';
import {
  loadFundingFlip,
  loadLiqClusters,
  loadOptionsSnapshot,
  loadRvCone,
  loadStablecoinSsr,
  loadVenueDivergence,
} from '$lib/server/marketIndicatorFeeds';
import { getRequestIp } from '$lib/server/requestIp';

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;
const VALID_TF = /^(1m|3m|5m|15m|30m|1h|2h|4h|6h|12h|1d|3d|1w|1M)$/;
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; payload: unknown }>();

// Minimal analyze payload shape we care about (pattern score + direction).
interface AnalyzeMini {
  snapshot?: {
    pattern_score?: number;
    ensemble_score?: number;
    direction?: string;
    active_block_count?: number;
  };
  score?: number;
  direction?: string;
}

async function loadAnalyzeMini(symbol: string, tf: string): Promise<AnalyzeMini | null> {
  try {
    const { payload } = await getAnalyzePayload({
      symbol,
      tf,
      requestId: `internal:confluence:${symbol}:${tf}`,
    });
    const analyze = payload as AnalyzeMini & { blocks_triggered?: unknown[] };
    const activeBlockCount =
      typeof analyze.snapshot?.active_block_count === 'number'
        ? analyze.snapshot.active_block_count
        : Array.isArray(analyze.blocks_triggered)
          ? analyze.blocks_triggered.length
          : undefined;
    return {
      snapshot: analyze.snapshot
        ? {
            ...analyze.snapshot,
            active_block_count: activeBlockCount,
          }
        : undefined,
      score: analyze.score,
      direction: analyze.direction,
    };
  } catch {
    return null;
  }
}

function enrichConfluenceResult(symbol: string, result: ConfluenceResult): ConfluenceResult {
  pushConfluence(symbol, {
    at: result.at,
    score: result.score,
    confidence: result.confidence,
    regime: result.regime,
    divergence: result.divergence,
  });

  const divergenceStreak = streakBack(symbol, (entry) => entry.divergence);
  const sameRegimeStreak = streakBack(symbol, (entry) => entry.regime === result.regime);
  return { ...result, divergenceStreak, sameRegimeStreak };
}

/** Map non-BTCUSDT spot symbols onto Deribit's BTC/ETH option currencies. */
function symbolToDeribitCurrency(sym: string): string | null {
  if (sym.startsWith('BTC')) return 'BTC';
  if (sym.startsWith('ETH')) return 'ETH';
  return null;
}

/** Reduce liq heatmap cells into {aboveDistancePct, belowDistancePct, intensity} snapshot. */
function summarizeLiq(
  payload: Awaited<ReturnType<typeof loadLiqClusters>>['payload'] | null,
  currentPrice: number | null
): ConfluenceInput['liqMagnet'] {
  if (!payload?.cells?.length || currentPrice == null || currentPrice <= 0) return null;
  let closestAbove: (typeof payload.cells)[number] | null = null;
  let closestBelow: (typeof payload.cells)[number] | null = null;
  let maxIntensity = 0;
  for (const c of payload.cells) {
    const p = c.priceBucket;
    if (!Number.isFinite(p)) continue;
    if (p > currentPrice && (!closestAbove || p < closestAbove.priceBucket)) closestAbove = c;
    if (p < currentPrice && (!closestBelow || p > closestBelow.priceBucket)) closestBelow = c;
    if (c.intensity > maxIntensity) maxIntensity = c.intensity;
  }
  const intensity = maxIntensity > 0 ? Math.min(1, closestAbove || closestBelow ? 1 : 0) : 0;
  const aboveDistancePct = closestAbove
    ? ((closestAbove.priceBucket - currentPrice) / currentPrice) * 100
    : null;
  const belowDistancePct = closestBelow
    ? ((currentPrice - closestBelow.priceBucket) / currentPrice) * 100
    : null;
  return { aboveDistancePct, belowDistancePct, intensity };
}

async function safeLoad<T>(load: () => Promise<{ payload: T }>): Promise<T | null> {
  try {
    return (await load()).payload;
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async ({ url, request, getClientAddress, fetch: _kitFetch }) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const tf = (url.searchParams.get('tf') ?? '4h').trim();
  if (!VALID_SYMBOL.test(symbol)) return json({ error: 'invalid symbol' }, { status: 400 });
  if (!VALID_TF.test(tf)) return json({ error: 'invalid tf' }, { status: 400 });

  const ip = getRequestIp({ request, getClientAddress });
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '30' } });
  }

  const cacheKey = `${symbol}|${tf}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.payload, {
      headers: {
        'X-Cache': 'HIT',
        'X-WTD-Plane': 'fact',
        'X-WTD-Upstream': 'cache',
        'X-WTD-State': 'adapter',
      },
    });
  }

  const engineConfluence = await fetchFactConfluenceProxy(_kitFetch, {
    symbol,
    timeframe: tf,
    offline: true,
  });
  if (engineConfluence) {
    const enriched = enrichConfluenceResult(symbol, adaptEngineFactConfluence(engineConfluence));
    cache.set(cacheKey, { at: Date.now(), payload: enriched });
    return json(enriched, {
      headers: {
        'X-Cache': 'MISS',
        'X-WTD-Plane': 'fact',
        'X-WTD-Upstream': 'facts/confluence',
        'X-WTD-State': 'adapter',
      },
    });
  }

  const deribitCurrency = symbolToDeribitCurrency(symbol);

  // Parallel aggregate — any failure → null, composition still works.
  const [analyze, venueDiv, rvCone, ssr, flip, liq, options] = await Promise.all([
    loadAnalyzeMini(symbol, tf),
    safeLoad(() => loadVenueDivergence(symbol)),
    safeLoad(() => loadRvCone(symbol)),
    safeLoad(() => loadStablecoinSsr()),
    safeLoad(() => loadFundingFlip(symbol)),
    safeLoad(() => loadLiqClusters({ symbol, window: '4h', fetchImpl: _kitFetch })),
    deribitCurrency
      ? safeLoad(() => loadOptionsSnapshot(deribitCurrency))
      : Promise.resolve(null),
  ]);

  const input: ConfluenceInput = {
    symbol,
    at: Date.now(),
    pattern: analyze
      ? {
          score: analyze.snapshot?.ensemble_score
              ?? analyze.snapshot?.pattern_score
              ?? analyze.score
              ?? null,
          direction: analyze.snapshot?.direction ?? analyze.direction ?? null,
          activeBlocks: analyze.snapshot?.active_block_count ?? null,
        }
      : null,
    venueDivergence: venueDiv?.oi?.length
      ? {
          oi: venueDiv.oi,
          funding: venueDiv.funding ?? [],
        }
      : null,
    rvCone: rvCone?.percentile?.['30'] != null
      ? { percentile30d: rvCone.percentile['30'] }
      : null,
    ssr: ssr?.percentile != null
      ? { percentile: ssr.percentile, regime: ssr.regime ?? 'neutral' }
      : null,
    fundingFlip: flip?.direction
      ? {
          direction: flip.direction,
          persistedHours: flip.persistedHours ?? 0,
          consecutiveIntervals: flip.consecutiveIntervals ?? 0,
          currentRate: flip.currentRate ?? 0,
        }
      : null,
    liqMagnet: liq?.currentPrice ? summarizeLiq(liq, liq.currentPrice) : null,
    options: options && options.skew25d != null && options.putCallRatioOi != null
      ? {
          putCallRatioOi: options.putCallRatioOi,
          putCallRatioVol: options.putCallRatioVol ?? options.putCallRatioOi,
          skew25d: options.skew25d,
          atmIvNearTerm: options.atmIvNearTerm ?? 0,
          pinDistancePct: options.gamma?.pinDistancePct ?? null,
          maxPainDistancePct: options.gamma?.maxPainDistancePct ?? null,
        }
      : null,
  };

  const enriched = enrichConfluenceResult(symbol, computeConfluence(input));

  cache.set(cacheKey, { at: Date.now(), payload: enriched });
  return json(enriched, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'X-Cache': 'MISS',
      'X-WTD-Plane': 'fact',
      'X-WTD-Upstream': 'legacy-compute',
      'X-WTD-State': 'fallback',
    },
  });
};
