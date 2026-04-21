/**
 * GET /api/market/funding-flip?symbol=BTCUSDT
 *
 * W-0122-F — Funding Flip Clock.
 *
 * Binance perp funding publishes every 8h. A "flip" is when the sign changes
 * (+ → − or − → +). The time since the last flip is a powerful positioning
 * signal: fresh flips mean one-sided leverage is being unwound.
 *
 * Source: Binance `/fapi/v1/fundingRate` (free, 1000-limit).
 * Cache: 10 minutes.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';

export interface FundingFlipPayload {
  symbol: string;
  at: number;
  /** Current funding rate (fractional, not percent). */
  currentRate: number;
  /** Last rate before the most recent flip. */
  previousRate: number;
  /** ms timestamp of the flip event (last funding row whose sign differed from current). */
  flippedAt: number | null;
  /** Hours persisted since flip — the regime-duration signal. */
  persistedHours: number;
  /** Direction of the flip. */
  direction: 'pos_to_neg' | 'neg_to_pos' | 'persisted';
  /** Number of funding intervals at the current sign. */
  consecutiveIntervals: number;
}

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;
const CACHE_TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 8_000;
const cache = new Map<string, { at: number; payload: FundingFlipPayload }>();

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'cogochi-terminal/funding-flip' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface BinanceFundingPoint { fundingTime: number; fundingRate: string }

function sign(v: number): 1 | -1 | 0 {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) {
    return json({ error: 'invalid symbol' }, { status: 400 });
  }

  const ip = getClientAddress();
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
  }

  // 250 funding points × 8h = ~83 days of history.
  const hist = await safeFetchJson<BinanceFundingPoint[]>(
    `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=250`
  );

  if (!Array.isArray(hist) || hist.length < 10) {
    return json({ error: 'upstream_unavailable' }, { status: 503 });
  }

  // Binance returns ascending. Walk newest → oldest to find last sign flip.
  const sorted = [...hist].sort((a, b) => a.fundingTime - b.fundingTime);
  const rates = sorted.map(p => ({ ts: p.fundingTime, rate: Number(p.fundingRate) }));
  const currentRate = rates[rates.length - 1].rate;
  const currentSign = sign(currentRate);

  let flipIdx = -1;
  for (let i = rates.length - 2; i >= 0; i--) {
    const s = sign(rates[i].rate);
    if (s !== 0 && currentSign !== 0 && s !== currentSign) {
      flipIdx = i;
      break;
    }
  }

  let payload: FundingFlipPayload;

  if (flipIdx === -1 || currentSign === 0) {
    // No flip in window — treat as persisted.
    payload = {
      symbol,
      at: Date.now(),
      currentRate,
      previousRate: rates[0].rate,
      flippedAt: null,
      persistedHours: (rates[rates.length - 1].ts - rates[0].ts) / 3_600_000,
      direction: 'persisted',
      consecutiveIntervals: rates.length,
    };
  } else {
    const flipPoint = rates[flipIdx];
    const firstAfterFlipTs = rates[flipIdx + 1]?.ts ?? rates[rates.length - 1].ts;
    const persistedHours = (rates[rates.length - 1].ts - firstAfterFlipTs) / 3_600_000;
    const consecutive = rates.length - 1 - flipIdx;
    payload = {
      symbol,
      at: Date.now(),
      currentRate,
      previousRate: flipPoint.rate,
      flippedAt: firstAfterFlipTs,
      persistedHours: Math.max(0, persistedHours),
      direction: currentSign > 0 ? 'neg_to_pos' : 'pos_to_neg',
      consecutiveIntervals: consecutive,
    };
  }

  cache.set(symbol, { at: Date.now(), payload });
  return json(payload, { headers: { 'X-Cache': 'MISS' } });
};
