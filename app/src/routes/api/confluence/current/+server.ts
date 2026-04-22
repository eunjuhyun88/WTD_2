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
import { pushConfluence, streakBack } from '$lib/server/confluenceHistory';
import { getRequestIp } from '$lib/server/requestIp';

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;
const VALID_TF = /^(1m|3m|5m|15m|30m|1h|2h|4h|6h|12h|1d|3d|1w|1M)$/;
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; payload: unknown }>();

async function fetchSelf<T>(origin: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${origin}${path}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'cogochi-terminal/confluence' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

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

interface VenueRow { venue: string; current: number; highlight?: boolean }
interface VenuePayload { oi?: VenueRow[]; funding?: VenueRow[] }
interface RvPayload { percentile?: Record<string, number> }
interface SsrPayload { percentile?: number; regime?: 'dry_powder_high' | 'dry_powder_low' | 'neutral' }
interface FlipPayload {
  direction?: 'pos_to_neg' | 'neg_to_pos' | 'persisted';
  persistedHours?: number;
  consecutiveIntervals?: number;
  currentRate?: number;
}
interface LiqCell { priceBucket: number; timeBucket: number; intensity: number; side?: string }
interface LiqPayload { cells?: LiqCell[]; currentPrice?: number }
interface OptionsPayload {
  putCallRatioOi?: number;
  putCallRatioVol?: number;
  skew25d?: number;
  atmIvNearTerm?: number;
  gamma?: {
    pinLevel?: number | null;
    pinDistancePct?: number | null;
    maxPain?: number | null;
    maxPainDistancePct?: number | null;
    pinDirection?: 'above' | 'below' | 'at' | null;
  };
}

/** Map non-BTCUSDT spot symbols onto Deribit's BTC/ETH option currencies. */
function symbolToDeribitCurrency(sym: string): string | null {
  if (sym.startsWith('BTC')) return 'BTC';
  if (sym.startsWith('ETH')) return 'ETH';
  return null;
}

/** Reduce liq heatmap cells into {aboveDistancePct, belowDistancePct, intensity} snapshot. */
function summarizeLiq(
  payload: LiqPayload | null,
  currentPrice: number | null
): ConfluenceInput['liqMagnet'] {
  if (!payload?.cells?.length || currentPrice == null || currentPrice <= 0) return null;
  let closestAbove: LiqCell | null = null;
  let closestBelow: LiqCell | null = null;
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
    return json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
  }

  const origin = url.origin;

  const deribitCurrency = symbolToDeribitCurrency(symbol);

  // Parallel aggregate — any failure → null, composition still works.
  const [analyze, venueDiv, rvCone, ssr, flip, liq, options] = await Promise.all([
    // analyze is auth-protected; we're server-side so we use fetchSelf but it will 401 unless
    // we attach a cookie. For now: accept that pattern score may be missing when unauth'd — a
    // separate read-only public analyze endpoint will be added in W-0122-Confluence-P2.
    // This is explicitly documented so reviewers see the intentional limit.
    fetchSelf<AnalyzeMini>(origin, `/api/cogochi/analyze?symbol=${symbol}&tf=${tf}`),
    fetchSelf<VenuePayload>(origin, `/api/market/venue-divergence?symbol=${symbol}`),
    fetchSelf<RvPayload>(origin, `/api/market/rv-cone?symbol=${symbol}`),
    fetchSelf<SsrPayload>(origin, `/api/market/stablecoin-ssr`),
    fetchSelf<FlipPayload>(origin, `/api/market/funding-flip?symbol=${symbol}`),
    fetchSelf<LiqPayload>(origin, `/api/market/liq-clusters?symbol=${symbol}&window=4h`),
    deribitCurrency
      ? fetchSelf<OptionsPayload>(origin, `/api/market/options-snapshot?currency=${deribitCurrency}`)
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

  const result = computeConfluence(input);

  // Phase 2: push into in-memory ring buffer for history/streak queries.
  pushConfluence(symbol, {
    at: result.at,
    score: result.score,
    confidence: result.confidence,
    regime: result.regime,
    divergence: result.divergence,
  });

  // Attach derived streaks so the UI can flag persistent regimes without
  // a second round-trip. Streaks are evaluated over the in-memory ring only.
  const divergenceStreak = streakBack(symbol, e => e.divergence);
  const sameRegimeStreak = streakBack(symbol, e => e.regime === result.regime);
  const enriched = { ...result, divergenceStreak, sameRegimeStreak };

  cache.set(cacheKey, { at: Date.now(), payload: enriched });
  return json(enriched, { headers: { 'X-Cache': 'MISS' } });
};
