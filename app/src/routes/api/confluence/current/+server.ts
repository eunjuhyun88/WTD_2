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
import type { ConfluenceContribution, ConfluenceResult } from '$lib/confluence/types';
import { regimeFromScore } from '$lib/confluence/types';
import { pushConfluence, streakBack } from '$lib/server/confluenceHistory';
import { buildPlaneAppPath } from '$lib/server/enginePlaneProxy';
import { getRequestIp } from '$lib/server/requestIp';

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;
const VALID_TF = /^(1m|3m|5m|15m|30m|1h|2h|4h|6h|12h|1d|3d|1w|1M)$/;
const CACHE_TTL_MS = 30_000;
const ENGINE_FACT_CONFLUENCE_MAX_SCORE = 6;
const cache = new Map<string, { at: number; payload: unknown }>();

async function fetchSelf<T>(fetchFn: typeof fetch, origin: string, path: string): Promise<T | null> {
  try {
    const res = await fetchFn(`${origin}${path}`, {
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

interface EngineFactConfluencePayload {
  ok?: boolean;
  generated_at?: string;
  symbol?: string;
  timeframe?: string;
  summary?: {
    bias?: string;
    score?: number;
    evidenceCount?: number;
    confidencePct?: number;
  };
  evidence?: Array<{
    metric?: string;
    bias?: string;
    value?: unknown;
  }>;
}

async function fetchEngineFactConfluence(
  fetchFn: typeof fetch,
  symbol: string,
  timeframe: string,
): Promise<EngineFactConfluencePayload | null> {
  try {
    const res = await fetchFn(
      `${buildPlaneAppPath('facts', 'confluence')}?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      {
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as EngineFactConfluencePayload;
    return payload?.ok ? payload : null;
  } catch {
    return null;
  }
}

function labelFromMetric(metric: string | undefined): string {
  const raw = metric?.trim() || 'fact';
  return raw
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function adaptEngineContribution(
  row: NonNullable<EngineFactConfluencePayload['evidence']>[number],
  weight: number,
): ConfluenceContribution {
  const direction = row.bias === 'bullish' ? 1 : row.bias === 'bearish' ? -1 : 0;
  const metric = row.metric?.trim() || 'fact';
  const value = row.value == null ? '' : ` = ${String(row.value)}`;
  return {
    source: metric,
    label: labelFromMetric(metric),
    score: direction,
    weight,
    weighted: direction * weight,
    magnitude: Math.abs(direction),
    reason: `${row.bias ?? 'neutral'}${value}`,
  };
}

export function adaptEngineFactConfluence(payload: EngineFactConfluencePayload): ConfluenceResult {
  const rawScore = Number(payload.summary?.score ?? 0);
  const confidence = Math.max(0, Math.min(1, Number(payload.summary?.confidencePct ?? 0) / 100));
  const score = Math.max(
    -100,
    Math.min(100, Math.round((rawScore / ENGINE_FACT_CONFLUENCE_MAX_SCORE) * 100)),
  );
  const evidence = payload.evidence ?? [];
  const weight = evidence.length > 0 ? 1 / evidence.length : 0;
  const contributions = evidence.map((row) => adaptEngineContribution(row, weight));
  const top = contributions.slice(0, 3);
  const hasBull = contributions.some((row) => row.score > 0);
  const hasBear = contributions.some((row) => row.score < 0);
  const at = Date.parse(payload.generated_at ?? '');

  return {
    at: Number.isFinite(at) ? at : Date.now(),
    symbol: payload.symbol ?? 'BTCUSDT',
    score,
    confidence,
    regime: regimeFromScore(score, confidence),
    contributions,
    top,
    divergence: hasBull && hasBear,
  };
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
    return json(cached.payload, {
      headers: {
        'X-Cache': 'HIT',
        'X-WTD-Plane': 'fact',
        'X-WTD-Upstream': 'cache',
        'X-WTD-State': 'adapter',
      },
    });
  }

  const origin = url.origin;
  const engineConfluence = await fetchEngineFactConfluence(_kitFetch, symbol, tf);
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
    // analyze is auth-protected; we're server-side so we use fetchSelf but it will 401 unless
    // we attach a cookie. For now: accept that pattern score may be missing when unauth'd — a
    // separate read-only public analyze endpoint will be added in W-0122-Confluence-P2.
    // This is explicitly documented so reviewers see the intentional limit.
    fetchSelf<AnalyzeMini>(_kitFetch, origin, `/api/cogochi/analyze?symbol=${symbol}&tf=${tf}`),
    fetchSelf<VenuePayload>(_kitFetch, origin, `/api/market/venue-divergence?symbol=${symbol}`),
    fetchSelf<RvPayload>(_kitFetch, origin, `/api/market/rv-cone?symbol=${symbol}`),
    fetchSelf<SsrPayload>(_kitFetch, origin, `/api/market/stablecoin-ssr`),
    fetchSelf<FlipPayload>(_kitFetch, origin, `/api/market/funding-flip?symbol=${symbol}`),
    fetchSelf<LiqPayload>(_kitFetch, origin, `/api/market/liq-clusters?symbol=${symbol}&window=4h`),
    deribitCurrency
      ? fetchSelf<OptionsPayload>(_kitFetch, origin, `/api/market/options-snapshot?currency=${deribitCurrency}`)
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
      'X-Cache': 'MISS',
      'X-WTD-Plane': 'fact',
      'X-WTD-Upstream': 'legacy-compute',
      'X-WTD-State': 'fallback',
    },
  });
};
