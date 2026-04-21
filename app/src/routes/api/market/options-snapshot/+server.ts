/**
 * GET /api/market/options-snapshot?currency=BTC
 *
 * W-0122-C1 — Deribit Options Snapshot (Phase 1: REST, no WS).
 *
 * Free Deribit public endpoint `public/get_book_summary_by_currency` returns
 * mark_iv, open_interest, volume per instrument. From this we compute the
 * trader-signal layer:
 *
 *   - Put/Call OI ratio       — overall market posture
 *   - Put/Call Volume ratio   — short-term flow
 *   - 25-delta skew proxy     — OTM put IV minus OTM call IV (positive = fear)
 *   - Total OI (USD-equivalent) per side
 *   - IV of near-term ATM options as a DVOL proxy
 *
 * Phase 2 (separate slice) will add WS streaming + real Greeks + GEX computation.
 *
 * Cache: 5 min (options structure moves slowly on mid/large timeframes).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';

export interface OptionsSnapshotPayload {
  currency: string;
  at: number;
  underlyingPrice: number;
  totalOI: { call: number; put: number; total: number };
  totalVolume24h: { call: number; put: number };
  putCallRatioOi: number;
  putCallRatioVol: number;
  /** IV of OTM put (~90% moneyness) minus IV of OTM call (~110% moneyness), near-term. */
  skew25d: number;
  /** Average ATM IV for near-term expiry — proxy for DVOL. */
  atmIvNearTerm: number;
  /** Counts that went into each metric for transparency. */
  counts: {
    callStrikes: number;
    putStrikes: number;
    nearTermInstruments: number;
  };
  /** Per-expiry summary for the nearest 3 expiries. */
  expiries: Array<{
    expiry: string;
    daysToExpiry: number;
    callOi: number;
    putOi: number;
    atmIv: number | null;
  }>;
}

const VALID_CURRENCY = /^(BTC|ETH)$/;
const CACHE_TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 10_000;
const cache = new Map<string, { at: number; payload: OptionsSnapshotPayload }>();

interface DeribitInstrument {
  instrument_name: string;
  mark_iv?: number | null;
  open_interest?: number | null;
  volume?: number | null;
  volume_usd?: number | null;
  underlying_price?: number | null;
  mark_price?: number | null;
}

interface DeribitResponse { result?: DeribitInstrument[] }

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'cogochi-terminal/options' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Parse Deribit instrument name: `BTC-25DEC26-65000-P`.
 * Returns null on invalid format.
 */
function parseInstrument(name: string): {
  expiryStr: string;
  expiryTs: number;
  strike: number;
  type: 'C' | 'P';
} | null {
  const parts = name.split('-');
  if (parts.length !== 4) return null;
  const [, expiryStr, strikeStr, typeStr] = parts;
  const type = typeStr === 'C' || typeStr === 'P' ? typeStr : null;
  if (!type) return null;
  const strike = Number(strikeStr);
  if (!Number.isFinite(strike)) return null;

  // Expiry format: 25DEC26 (DD MMM YY).
  const m = expiryStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const [, ddStr, mmm, yyStr] = m;
  const monthMap: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const month = monthMap[mmm];
  if (month == null) return null;
  const year = 2000 + Number(yyStr);
  const day = Number(ddStr);
  // Deribit options expire at 08:00 UTC.
  const expiryTs = Date.UTC(year, month, day, 8, 0, 0);
  return { expiryStr, expiryTs, strike, type };
}

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  const currency = (url.searchParams.get('currency') ?? 'BTC').toUpperCase();
  if (!VALID_CURRENCY.test(currency)) {
    return json({ error: 'invalid currency' }, { status: 400 });
  }

  const ip = getClientAddress();
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const cached = cache.get(currency);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
  }

  const data = await safeFetchJson<DeribitResponse>(
    `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`
  );
  const instruments = data?.result ?? [];
  if (!instruments.length) {
    return json({ error: 'upstream_unavailable' }, { status: 503 });
  }

  // Derive underlying price from any instrument (they all share it).
  const underlyingPrice = instruments.find(i => Number.isFinite(i.underlying_price))?.underlying_price ?? 0;
  if (!underlyingPrice) {
    return json({ error: 'no_underlying' }, { status: 503 });
  }

  const now = Date.now();
  let callOi = 0, putOi = 0;
  let callVol = 0, putVol = 0;
  let callStrikes = 0, putStrikes = 0;

  // Per-expiry accumulators
  const byExpiry = new Map<string, {
    expiryStr: string;
    expiryTs: number;
    callOi: number;
    putOi: number;
    atmIvSum: number;
    atmIvCount: number;
  }>();

  // Near-term (<60d) OTM IV accumulators for skew computation.
  let nearTermPutIvSum = 0, nearTermPutIvCount = 0;
  let nearTermCallIvSum = 0, nearTermCallIvCount = 0;
  let atmIvSum = 0, atmIvCount = 0;
  let nearTermInstruments = 0;

  for (const inst of instruments) {
    const parsed = parseInstrument(inst.instrument_name);
    if (!parsed) continue;

    const oi = Number(inst.open_interest) || 0;
    const vol = Number(inst.volume) || 0;
    const iv = Number(inst.mark_iv); // Deribit returns IV as % (e.g. 47.21 for 47.21%)

    if (parsed.type === 'C') {
      callOi += oi;
      callVol += vol;
      if (oi > 0) callStrikes++;
    } else {
      putOi += oi;
      putVol += vol;
      if (oi > 0) putStrikes++;
    }

    // Per-expiry bucket
    const exKey = parsed.expiryStr;
    if (!byExpiry.has(exKey)) {
      byExpiry.set(exKey, {
        expiryStr: parsed.expiryStr,
        expiryTs: parsed.expiryTs,
        callOi: 0,
        putOi: 0,
        atmIvSum: 0,
        atmIvCount: 0,
      });
    }
    const bucket = byExpiry.get(exKey)!;
    if (parsed.type === 'C') bucket.callOi += oi;
    else bucket.putOi += oi;

    const daysToExpiry = (parsed.expiryTs - now) / 86_400_000;
    if (daysToExpiry < 1) continue; // skip expired / same-day

    // ATM band: ±5% of spot
    const moneyness = parsed.strike / underlyingPrice;
    const isAtm = moneyness >= 0.95 && moneyness <= 1.05;
    if (isAtm && Number.isFinite(iv) && iv > 0) {
      bucket.atmIvSum += iv;
      bucket.atmIvCount++;
      if (daysToExpiry < 60) {
        atmIvSum += iv;
        atmIvCount++;
      }
    }

    // 25-delta skew proxy: OTM puts at ~90% moneyness, OTM calls at ~110% moneyness, near-term.
    if (daysToExpiry < 60 && daysToExpiry > 3 && Number.isFinite(iv) && iv > 0) {
      nearTermInstruments++;
      if (parsed.type === 'P' && moneyness >= 0.87 && moneyness <= 0.93) {
        nearTermPutIvSum += iv;
        nearTermPutIvCount++;
      }
      if (parsed.type === 'C' && moneyness >= 1.07 && moneyness <= 1.13) {
        nearTermCallIvSum += iv;
        nearTermCallIvCount++;
      }
    }
  }

  const putCallRatioOi = callOi > 0 ? putOi / callOi : 0;
  const putCallRatioVol = callVol > 0 ? putVol / callVol : 0;

  const avgPutIv = nearTermPutIvCount > 0 ? nearTermPutIvSum / nearTermPutIvCount : 0;
  const avgCallIv = nearTermCallIvCount > 0 ? nearTermCallIvSum / nearTermCallIvCount : 0;
  const skew25d = avgPutIv && avgCallIv ? avgPutIv - avgCallIv : 0;

  const atmIvNearTerm = atmIvCount > 0 ? atmIvSum / atmIvCount : 0;

  const expiries = [...byExpiry.values()]
    .filter(b => b.expiryTs > now)
    .sort((a, b) => a.expiryTs - b.expiryTs)
    .slice(0, 3)
    .map(b => ({
      expiry: b.expiryStr,
      daysToExpiry: Math.max(0, (b.expiryTs - now) / 86_400_000),
      callOi: b.callOi,
      putOi: b.putOi,
      atmIv: b.atmIvCount ? b.atmIvSum / b.atmIvCount : null,
    }));

  const payload: OptionsSnapshotPayload = {
    currency,
    at: now,
    underlyingPrice,
    totalOI: { call: callOi, put: putOi, total: callOi + putOi },
    totalVolume24h: { call: callVol, put: putVol },
    putCallRatioOi,
    putCallRatioVol,
    skew25d,
    atmIvNearTerm,
    counts: { callStrikes, putStrikes, nearTermInstruments },
    expiries,
  };

  cache.set(currency, { at: now, payload });
  return json(payload, { headers: { 'X-Cache': 'MISS' } });
};
