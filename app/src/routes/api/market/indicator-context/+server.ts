/**
 * GET /api/market/indicator-context?symbol=BTCUSDT
 *
 * W-0122 Phase 2 — engine-free rolling percentile provider.
 *
 * Fetches 30 days of OI and funding history from Binance public endpoints
 * and computes the current reading's percentile position within that
 * distribution. Ships the app adapter a real percentile instead of the
 * magnitude-pinned estimate it uses as a fallback.
 *
 * Output shape matches what `adapter.ts` expects so the bridge is trivial.
 *
 * Caching: 10 minutes (OI/funding update cadence is hourly; 10m is the
 * sweet spot between freshness and upstream rate-limit consumption).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';

export interface IndicatorContextPayload {
  symbol: string;
  at: number;
  /** 30-day distribution percentile for the current reading (0-100, signed). */
  context: {
    oi_change_1h?: { value: number; percentile: number };
    funding_rate?:  { value: number; percentile: number };
    oi_change_4h?:  { value: number; percentile: number };
  };
}

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;
const CACHE_TTL_MS = 10 * 60_000; // 10 min
const cache = new Map<string, { at: number; payload: IndicatorContextPayload }>();
const TIMEOUT_MS = 8_000;

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'cogochi-terminal/indicator-context' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Compute percentile of `value` within `distribution` on a 0-100 scale,
 * preserving sign (so +extreme maps to 100, -extreme to 0, median to 50).
 *
 * The percentile is the fraction of distribution entries less-than-or-equal-to
 * `value`, rescaled so 50 represents the median.
 */
function signedPercentile(value: number, distribution: number[]): number {
  if (!distribution.length) return 50;
  const sorted = [...distribution].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return 50;
  // Binary search for rank.
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  const rank = lo;
  const pct = (rank / sorted.length) * 100;
  return Math.max(0, Math.min(100, pct));
}

// ── Binance: 30d OI history + funding history ──────────────────────────────
interface BinanceOIPoint { timestamp: number; sumOpenInterestValue?: string; sumOpenInterest?: string }
interface BinanceFundingPoint { fundingTime: number; fundingRate: string }

async function fetchBinance30d(symbol: string): Promise<{
  oiValues: number[];
  oi1hDeltas: number[];
  oi4hDeltas: number[];
  fundingValues: number[];
  currentOiDelta1h: number | null;
  currentOiDelta4h: number | null;
  currentFunding: number | null;
}> {
  // Binance OI history max 500 pts × 1h = ~20 days. We fetch the max.
  const [oiHist1h, oiHist4h, fundingHist] = await Promise.all([
    safeFetchJson<BinanceOIPoint[]>(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=500`,
    ),
    safeFetchJson<BinanceOIPoint[]>(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=4h&limit=500`,
    ),
    // funding: 30d × 3/day = 90 pts
    safeFetchJson<BinanceFundingPoint[]>(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=250`,
    ),
  ]);

  const oi1h = Array.isArray(oiHist1h) ? oiHist1h : [];
  const oi4h = Array.isArray(oiHist4h) ? oiHist4h : [];
  const fd   = Array.isArray(fundingHist) ? fundingHist : [];

  const oiValues1h = oi1h
    .map(p => Number(p.sumOpenInterestValue || p.sumOpenInterest || 0))
    .filter(v => Number.isFinite(v) && v > 0);
  const oiValues4h = oi4h
    .map(p => Number(p.sumOpenInterestValue || p.sumOpenInterest || 0))
    .filter(v => Number.isFinite(v) && v > 0);

  const oi1hDeltas: number[] = [];
  for (let i = 1; i < oiValues1h.length; i++) {
    const prev = oiValues1h[i - 1], cur = oiValues1h[i];
    if (prev > 0) oi1hDeltas.push((cur - prev) / prev);
  }
  const oi4hDeltas: number[] = [];
  for (let i = 1; i < oiValues4h.length; i++) {
    const prev = oiValues4h[i - 1], cur = oiValues4h[i];
    if (prev > 0) oi4hDeltas.push((cur - prev) / prev);
  }
  const fundingValues = fd.map(p => Number(p.fundingRate)).filter(v => Number.isFinite(v));

  return {
    oiValues: oiValues1h,
    oi1hDeltas,
    oi4hDeltas,
    fundingValues,
    currentOiDelta1h: oi1hDeltas.length ? oi1hDeltas[oi1hDeltas.length - 1] : null,
    currentOiDelta4h: oi4hDeltas.length ? oi4hDeltas[oi4hDeltas.length - 1] : null,
    currentFunding: fundingValues.length ? fundingValues[fundingValues.length - 1] : null,
  };
}

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) {
    return json({ error: 'invalid symbol' }, { status: 400 });
  }

  const ip = getRequestIp({ request, getClientAddress });
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
  }

  const b = await fetchBinance30d(symbol);
  const payload: IndicatorContextPayload = {
    symbol,
    at: Date.now(),
    context: {},
  };

  if (b.currentOiDelta1h != null && b.oi1hDeltas.length > 10) {
    payload.context.oi_change_1h = {
      value: b.currentOiDelta1h,
      percentile: signedPercentile(b.currentOiDelta1h, b.oi1hDeltas),
    };
  }
  if (b.currentOiDelta4h != null && b.oi4hDeltas.length > 10) {
    payload.context.oi_change_4h = {
      value: b.currentOiDelta4h,
      percentile: signedPercentile(b.currentOiDelta4h, b.oi4hDeltas),
    };
  }
  if (b.currentFunding != null && b.fundingValues.length > 10) {
    payload.context.funding_rate = {
      value: b.currentFunding,
      percentile: signedPercentile(b.currentFunding, b.fundingValues),
    };
  }

  cache.set(symbol, { at: Date.now(), payload });
  return json(payload, { headers: { 'X-Cache': 'MISS' } });
};
