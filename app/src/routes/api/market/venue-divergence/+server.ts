/**
 * GET /api/market/venue-divergence?symbol=BTCUSDT
 *
 * Per-venue OI and funding snapshot across Binance / Bybit / OKX.
 * All three exchanges expose these metrics on free public REST — no API key.
 *
 * Output shape matches `VenueSeriesRow[]` in `$lib/indicators/types.ts`
 * so the UI can feed the `<IndicatorVenueStrip>` Archetype F renderer
 * directly.
 *
 * Pillar 3 of the Free Indicator Stack (W-0122).
 * Competitors do not aggregate this — it is our industry-unique lever.
 *
 * Caching: 30s in-memory (price-moves faster than OI drift).
 * Rate limit: inherits chartFeedLimiter per-IP.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';

export interface VenueSeriesRowWire {
  venue: string;
  label: string;
  current: number;
  sparkline?: number[];
  highlight?: boolean;
}

interface VenueDivergencePayload {
  symbol: string;
  at: number;
  oi: VenueSeriesRowWire[];
  funding: VenueSeriesRowWire[];
}

// ── 30s in-memory cache (per SvelteKit instance) ─────────────────────────────
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; payload: VenueDivergencePayload }>();

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;

const TIMEOUT_MS = 5_000;

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'cogochi-terminal/venue-divergence' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Binance: OI delta (1h) + current funding ─────────────────────────────────
interface BinanceOIPoint { timestamp: number; sumOpenInterestValue: string; sumOpenInterest: string }
interface BinanceFunding { lastFundingRate: string }

async function fetchBinance(symbol: string): Promise<{ oiDelta: number | null; funding: number | null; oiSpark: number[] }> {
  const [oiHist, funding] = await Promise.all([
    safeFetchJson<BinanceOIPoint[]>(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=12`,
    ),
    safeFetchJson<BinanceFunding>(
      `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
    ),
  ]);
  const hist = Array.isArray(oiHist) ? oiHist : [];
  const vals = hist
    .map(p => Number(p.sumOpenInterestValue || p.sumOpenInterest || 0))
    .filter(v => Number.isFinite(v) && v > 0);
  const oiDelta = vals.length >= 2 ? (vals[vals.length - 1] - vals[0]) / vals[0] : null;
  const fr = funding?.lastFundingRate ? Number(funding.lastFundingRate) : null;
  return { oiDelta, funding: Number.isFinite(fr ?? NaN) ? fr : null, oiSpark: vals };
}

// ── Bybit: OI delta (1h) + current funding ───────────────────────────────────
interface BybitOIResp {
  result?: { list?: Array<{ timestamp: string; openInterest: string }> };
}
interface BybitTickerResp {
  result?: { list?: Array<{ fundingRate: string }> };
}

async function fetchBybit(symbol: string): Promise<{ oiDelta: number | null; funding: number | null; oiSpark: number[] }> {
  const [oiResp, tickerResp] = await Promise.all([
    safeFetchJson<BybitOIResp>(
      `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=1h&limit=12`,
    ),
    safeFetchJson<BybitTickerResp>(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
    ),
  ]);
  const list = oiResp?.result?.list ?? [];
  // Bybit returns newest first — reverse to oldest→newest so delta is forward in time
  const vals = list.map(p => Number(p.openInterest)).filter(v => Number.isFinite(v) && v > 0).reverse();
  const oiDelta = vals.length >= 2 ? (vals[vals.length - 1] - vals[0]) / vals[0] : null;
  const fr = tickerResp?.result?.list?.[0]?.fundingRate ? Number(tickerResp.result.list[0].fundingRate) : null;
  return { oiDelta, funding: Number.isFinite(fr ?? NaN) ? fr : null, oiSpark: vals };
}

// ── OKX: OI delta (1h) + current funding ─────────────────────────────────────
interface OkxOIResp {
  data?: Array<[string, string, string]>; // [ts, oi_ccy, oiUsd]
}
interface OkxFundingResp {
  data?: Array<{ fundingRate: string }>;
}

async function fetchOkx(symbol: string): Promise<{ oiDelta: number | null; funding: number | null; oiSpark: number[] }> {
  // OKX uses base-quote-SWAP format, e.g. BTC-USDT-SWAP
  const base = symbol.replace(/USDT$/, '');
  const instId = `${base}-USDT-SWAP`;
  // OKX's open-interest endpoint is snapshot-only on public tier, but open-interest-history exists.
  // Use /public/open-interest-history for a sparkline.
  const [oiHist, funding] = await Promise.all([
    safeFetchJson<OkxOIResp>(
      `https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${instId}&period=1H&limit=12`,
    ),
    safeFetchJson<OkxFundingResp>(
      `https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`,
    ),
  ]);
  // Rubik endpoint shape: [[ts, oi_ccy]]  (oi in base asset)
  const rows = oiHist?.data ?? [];
  const vals = rows
    .map(r => Number(r?.[1]))
    .filter(v => Number.isFinite(v) && v > 0)
    .reverse();
  const oiDelta = vals.length >= 2 ? (vals[vals.length - 1] - vals[0]) / vals[0] : null;
  const fr = funding?.data?.[0]?.fundingRate ? Number(funding.data[0].fundingRate) : null;
  return { oiDelta, funding: Number.isFinite(fr ?? NaN) ? fr : null, oiSpark: vals };
}

// ── Aggregate ────────────────────────────────────────────────────────────────
async function buildPayload(symbol: string): Promise<VenueDivergencePayload> {
  const [binance, bybit, okx] = await Promise.all([
    fetchBinance(symbol),
    fetchBybit(symbol),
    fetchOkx(symbol),
  ]);

  const oiRows: VenueSeriesRowWire[] = [];
  if (binance.oiDelta != null) oiRows.push({ venue: 'binance', label: 'Binance', current: binance.oiDelta, sparkline: binance.oiSpark });
  if (bybit.oiDelta != null)   oiRows.push({ venue: 'bybit',   label: 'Bybit',   current: bybit.oiDelta,   sparkline: bybit.oiSpark });
  if (okx.oiDelta != null)     oiRows.push({ venue: 'okx',     label: 'OKX',     current: okx.oiDelta,     sparkline: okx.oiSpark });

  // Mark the venue with max-abs current as highlighted (isolated pump detection)
  if (oiRows.length >= 2) {
    const maxAbs = Math.max(...oiRows.map(r => Math.abs(r.current)));
    const minAbs = Math.min(...oiRows.map(r => Math.abs(r.current)));
    if (maxAbs - minAbs > 0.03) {  // 3% divergence threshold
      const leader = oiRows.reduce((a, b) => (Math.abs(b.current) > Math.abs(a.current) ? b : a));
      leader.highlight = true;
    }
  }

  const fundingRows: VenueSeriesRowWire[] = [];
  if (binance.funding != null) fundingRows.push({ venue: 'binance', label: 'Binance', current: binance.funding });
  if (bybit.funding != null)   fundingRows.push({ venue: 'bybit',   label: 'Bybit',   current: bybit.funding });
  if (okx.funding != null)     fundingRows.push({ venue: 'okx',     label: 'OKX',     current: okx.funding });

  if (fundingRows.length >= 2) {
    const sorted = [...fundingRows].sort((a, b) => a.current - b.current);
    const spread = sorted[sorted.length - 1].current - sorted[0].current;
    if (spread > 0.0003) {  // 0.03% spread threshold (one funding period ~1h)
      const leader = fundingRows.reduce((a, b) => (Math.abs(b.current) > Math.abs(a.current) ? b : a));
      leader.highlight = true;
    }
  }

  return { symbol, at: Date.now(), oi: oiRows, funding: fundingRows };
}

// ── Route handler ────────────────────────────────────────────────────────────
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) {
    return json({ error: 'invalid symbol' }, { status: 400 });
  }

  // Rate limit
  const ip = getClientAddress();
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '30' } });
  }

  // Cache
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
  }

  const payload = await buildPayload(symbol);
  cache.set(symbol, { at: Date.now(), payload });

  return json(payload, { headers: { 'X-Cache': 'MISS' } });
};
