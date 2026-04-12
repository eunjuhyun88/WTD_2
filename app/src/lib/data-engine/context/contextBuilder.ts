// ═══════════════════════════════════════════════════════════════
// Data Engine — Context Builder
// ═══════════════════════════════════════════════════════════════
// 캐시 or 즉시 fetch → MarketContext + ExtendedMarketData 조립.
// /api/cogochi/analyze 에서 호출. per-request API 호출을 제거.
//
// 흐름:
//   1. 각 캐시 키에서 데이터 읽기
//   2. 캐시 미스 시 adapter 직접 fetch (cold path)
//   3. MarketContext + ExtendedMarketData 반환
//
// server-only.

import type { MarketContext } from '$lib/engine/factorEngine';
import type { ExtendedMarketData } from '$lib/engine/cogochi/types';
import type { BinanceKline } from '$lib/engine/types';

import { getOhlcv, setOhlcv } from '../cache/seriesCache';
import { getSnapshot, setSnapshot } from '../cache/snapshotCache';
import { ohlcvCacheKey, seriesCacheKey, DataCadence } from '../types';

import {
  fetchOhlcv,
  fetchFundingSnapshot,
  fetchOISnapshot,
  fetchLsRatioSnapshot,
  fetchTickerSnapshot,
  fetchDepthSnapshot,
  fetchOIHistSeries,
  fetchTakerRatioSeries,
  fetchForceOrdersSeries,
} from '../providers/binanceAdapter';
import { normalizeSymbol } from '../normalization/normalizeSymbol';

// ─── Result Type ─────────────────────────────────────────────

export interface BuiltContext {
  ctx: MarketContext;
  ext: ExtendedMarketData;
  currentPrice: number;
  change24h: number;
}

// ─── Internal helpers ─────────────────────────────────────────

/** OhlcvPoint[] → BinanceKline[] (layerEngine 호환 포맷) */
function toKlines(points: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>): BinanceKline[] {
  return points.map(p => ({
    time: p.t,
    open: p.o,
    high: p.h,
    low: p.l,
    close: p.c,
    volume: p.v,
  }));
}

// ─── Main Builder ─────────────────────────────────────────────

/**
 * MarketContext + ExtendedMarketData 조립.
 * 캐시에 데이터가 있으면 즉시 반환, 없으면 fetch 후 캐시 저장.
 */
export async function buildContext(
  symbol: string,
  tf: string,
): Promise<BuiltContext> {
  const sym = normalizeSymbol(symbol);

  // ── OHLCV (primary TF + 보조 TFs) ────────────────────────

  const [
    primaryOhlcv,
    ohlcv1h,
    ohlcv1d,
    ohlcv5m,
  ] = await Promise.all([
    getOrFetch_ohlcv(sym, tf, 200),
    getOrFetch_ohlcv(sym, '1h', 200),
    getOrFetch_ohlcv(sym, '1d', 100),
    getOrFetch_ohlcv(sym, '5m', 100),
  ]);

  // ── Snapshots ────────────────────────────────────────────

  const [
    fundingSnap,
    oiSnap,
    lsSnap,
    tickerSnap,
    depthSnap,
  ] = await Promise.all([
    getOrFetch_snapshot(sym, 'funding', () => fetchFundingSnapshot(sym), DataCadence.TICK),
    getOrFetch_snapshot(sym, 'oi_point', () => fetchOISnapshot(sym), DataCadence.MEDIUM),
    getOrFetch_snapshot(sym, 'ls_ratio', () => fetchLsRatioSnapshot(sym), DataCadence.SLOW),
    getOrFetch_snapshot(sym, 'ticker', () => fetchTickerSnapshot(sym), DataCadence.TICK),
    getOrFetch_snapshot(sym, 'depth', () => fetchDepthSnapshot(sym), DataCadence.FAST),
  ]);

  // ── Series (OI hist, taker ratio, force orders) ───────────

  const [
    oiHistPoints,
    takerPoints,
    forcePoints,
  ] = await Promise.all([
    getOrFetch_series(sym, 'oi_hist_5m', () => fetchOIHistSeries(sym), DataCadence.SLOW),
    getOrFetch_series(sym, 'taker_ratio', () => fetchTakerRatioSeries(sym), DataCadence.MEDIUM),
    getOrFetch_series(sym, 'force_orders', () => fetchForceOrdersSeries(sym), DataCadence.MEDIUM),
  ]);

  // ── Assemble ─────────────────────────────────────────────

  const klines = toKlines(primaryOhlcv);
  const klines1h = ohlcv1h.length > 0 ? toKlines(ohlcv1h) : undefined;
  const klines1d = ohlcv1d.length > 0 ? toKlines(ohlcv1d) : undefined;
  const klines5m = ohlcv5m.length > 0 ? toKlines(ohlcv5m) : undefined;

  const lastKline = klines[klines.length - 1];
  const currentPrice = lastKline?.close ?? 0;

  // OI change %: compare first vs last of OI history
  let oiChangePct = 0;
  if (oiHistPoints.length >= 2) {
    const first = oiHistPoints[0].v;
    const last = oiHistPoints[oiHistPoints.length - 1].v;
    if (first > 0) oiChangePct = (last - first) / first;
  }

  // Price change %: compare klines open vs close
  let priceChangePct = 0;
  if (klines.length >= 2) {
    const open = klines[0].open;
    const close = klines[klines.length - 1].close;
    if (open > 0) priceChangePct = (close - open) / open;
  }

  // Taker ratio (last point)
  const takerRatio = takerPoints.length > 0
    ? takerPoints[takerPoints.length - 1].v
    : undefined;

  // Force orders for ExtendedMarketData
  const forceOrders = forcePoints.map(p => ({
    side: (p.meta?.side ?? 0) >= 0 ? 'BUY' as const : 'SELL' as const,
    price: 0,    // not stored separately; use for liquidation volume only
    qty: p.v,
    time: p.t * 1000,
  }));

  // OI history for L19
  const oiHistory5m = oiHistPoints.map(p => ({
    timestamp: p.t * 1000,
    oi: p.v,
  }));

  // MarketContext
  const ctx: MarketContext = {
    pair: sym,
    timeframe: tf,
    klines,
    klines1h,
    klines1d,
    ticker: tickerSnap ? {
      change24h: tickerSnap.meta?.change24h ?? 0,
      volume24h: tickerSnap.meta?.vol24h ?? 0,
    } : undefined,
    derivatives: {
      oi: oiSnap?.value ?? null,
      funding: fundingSnap?.value ?? null,
      lsRatio: lsSnap?.value ?? null,
    },
  };

  // ExtendedMarketData
  const ext: ExtendedMarketData = {
    depth: depthSnap ? {
      bidVolume: depthSnap.meta?.bidVol ?? 0,
      askVolume: depthSnap.meta?.askVol ?? 0,
      ratio: depthSnap.value,
    } : undefined,
    takerRatio,
    oiChangePct,
    priceChangePct,
    forceOrders: forceOrders.length > 0 ? forceOrders : undefined,
    klines5m: klines5m?.map(k => ({
      time: k.time, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume,
    })),
    oiHistory5m: oiHistory5m.length > 0 ? oiHistory5m : undefined,
    currentPrice,
  };

  return {
    ctx,
    ext,
    currentPrice,
    change24h: tickerSnap?.meta?.change24h ?? 0,
  };
}

// ─── Cache helpers ───────────────────────────────────────────

async function getOrFetch_ohlcv(
  symbol: string,
  tf: string,
  limit: number,
) {
  const key = ohlcvCacheKey(symbol, tf);
  const cached = getOhlcv(key);
  if (cached && cached.length > 0) return cached;

  try {
    const points = await fetchOhlcv(symbol, tf, limit);
    if (points.length > 0) setOhlcv(key, points, DataCadence.SLOW2);
    return points;
  } catch {
    return [];
  }
}

async function getOrFetch_snapshot(
  symbol: string,
  shortId: string,
  fetcher: () => Promise<{ symbol: string; rawId: string; value: number; meta?: Record<string, number>; updatedAt: number } | null>,
  ttl: number,
) {
  const key = `snap:${symbol}:${shortId}`;
  const cached = getSnapshot(key);
  if (cached) return cached;

  try {
    const snap = await fetcher();
    if (snap) setSnapshot(key, snap, ttl);
    return snap;
  } catch {
    return null;
  }
}

async function getOrFetch_series(
  symbol: string,
  shortId: string,
  fetcher: () => Promise<Array<{ t: number; v: number; meta?: Record<string, number> }>>,
  ttl: number,
) {
  const key = seriesCacheKey(symbol, shortId);
  // simple in-memory check using seriesCache not needed here — use local Map
  return _seriesLocalCache(key, fetcher, ttl);
}

// local series cache (outside seriesCache module to avoid circular deps)
const _localSeries = new Map<string, { points: Array<{ t: number; v: number; meta?: Record<string, number> }>; expiresAt: number }>();

async function _seriesLocalCache(
  key: string,
  fetcher: () => Promise<Array<{ t: number; v: number; meta?: Record<string, number> }>>,
  ttl: number,
) {
  const existing = _localSeries.get(key);
  if (existing && Date.now() < existing.expiresAt) return existing.points;

  try {
    const points = await fetcher();
    _localSeries.set(key, { points, expiresAt: Date.now() + ttl });
    return points;
  } catch {
    return existing?.points ?? [];
  }
}
