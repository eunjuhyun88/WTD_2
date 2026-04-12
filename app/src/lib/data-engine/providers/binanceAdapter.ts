// ─── Binance Adapter ─────────────────────────────────────────
// 기존 rawSources.readRaw()를 data-engine 포맷으로 변환.
// server-only.

import { readRaw, klinesRawIdForTimeframe } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import type { OhlcvPoint, NormalizedPoint, NormalizedSnapshot } from '../types';
import { normalizeTimestamp } from '../normalization/normalizeTimestamp';
import { normalizeSymbol } from '../normalization/normalizeSymbol';
import { fundingToBps, normalizeTakerRatio } from '../normalization/normalizeUnit';

// ─── OHLCV ───────────────────────────────────────────────────

export async function fetchOhlcv(
  symbol: string,
  tf: string,
  limit = 200,
): Promise<OhlcvPoint[]> {
  const sym = normalizeSymbol(symbol);
  const rawId = klinesRawIdForTimeframe(tf);
  const klines = await readRaw(rawId, { symbol: sym, limit });
  return klines.map(k => ({
    t: normalizeTimestamp(k.time),
    o: k.open,
    h: k.high,
    l: k.low,
    c: k.close,
    v: k.volume,
  }));
}

// ─── Funding Rate Snapshot ───────────────────────────────────

export async function fetchFundingSnapshot(
  symbol: string,
): Promise<NormalizedSnapshot | null> {
  const sym = normalizeSymbol(symbol);
  const raw = await readRaw(KnownRawId.FUNDING_RATE, { symbol: sym }).catch(() => null);
  if (raw === null) return null;
  return {
    symbol: sym,
    rawId: KnownRawId.FUNDING_RATE,
    value: raw,           // decimal (e.g. 0.0001)
    meta: { bps: fundingToBps(raw) },
    updatedAt: Date.now(),
  };
}

// ─── OI Point Snapshot ───────────────────────────────────────

export async function fetchOISnapshot(
  symbol: string,
): Promise<NormalizedSnapshot | null> {
  const sym = normalizeSymbol(symbol);
  const raw = await readRaw(KnownRawId.OPEN_INTEREST_POINT, { symbol: sym }).catch(() => null);
  if (raw === null) return null;
  return {
    symbol: sym,
    rawId: KnownRawId.OPEN_INTEREST_POINT,
    value: raw,
    updatedAt: Date.now(),
  };
}

// ─── L/S Ratio Snapshot ──────────────────────────────────────

export async function fetchLsRatioSnapshot(
  symbol: string,
): Promise<NormalizedSnapshot | null> {
  const sym = normalizeSymbol(symbol);
  const raw = await readRaw(KnownRawId.LONG_SHORT_TOP_1H, { symbol: sym }).catch(() => null);
  if (raw === null) return null;
  return {
    symbol: sym,
    rawId: KnownRawId.LONG_SHORT_TOP_1H,
    value: raw,
    updatedAt: Date.now(),
  };
}

// ─── Ticker Snapshot ─────────────────────────────────────────

export async function fetchTickerSnapshot(
  symbol: string,
): Promise<NormalizedSnapshot | null> {
  const sym = normalizeSymbol(symbol);
  const raw = await readRaw(KnownRawId.TICKER_24HR, { symbol: sym }).catch(() => null);
  if (!raw) return null;
  const change24h = parseFloat(raw.priceChangePercent) || 0;
  const vol24h = parseFloat(raw.quoteVolume) || 0;
  return {
    symbol: sym,
    rawId: KnownRawId.TICKER_24HR,
    value: parseFloat(raw.lastPrice) || 0,
    meta: { change24h, vol24h },
    updatedAt: Date.now(),
  };
}

// ─── OI History Series ───────────────────────────────────────

export async function fetchOIHistSeries(
  symbol: string,
): Promise<NormalizedPoint[]> {
  const sym = normalizeSymbol(symbol);
  const points = await readRaw(KnownRawId.OI_HIST_5M, { symbol: sym }).catch(() => null);
  if (!points) return [];
  return points.map((p: { timestamp: number; sumOpenInterestValue: number }) => ({
    t: normalizeTimestamp(p.timestamp),
    v: p.sumOpenInterestValue,
  }));
}

// ─── Taker Ratio Series ──────────────────────────────────────

export async function fetchTakerRatioSeries(
  symbol: string,
): Promise<NormalizedPoint[]> {
  const sym = normalizeSymbol(symbol);
  const points = await readRaw(KnownRawId.TAKER_BUY_SELL_RATIO, { symbol: sym }).catch(() => null);
  if (!points || !Array.isArray(points)) return [];
  return points.map((p: { timestamp: number; buyVol: number; sellVol: number; buySellRatio: number }) => ({
    t: normalizeTimestamp(p.timestamp),
    v: normalizeTakerRatio(p.buyVol, p.sellVol),
    meta: { ratio: p.buySellRatio },
  }));
}

// ─── Force Orders Series ─────────────────────────────────────

export async function fetchForceOrdersSeries(
  symbol: string,
): Promise<NormalizedPoint[]> {
  const sym = normalizeSymbol(symbol);
  const orders = await readRaw(KnownRawId.FORCE_ORDERS_1H, { symbol: sym }).catch(() => null);
  if (!orders || !Array.isArray(orders)) return [];
  return orders.map((o: { time: number; side: string; origQty: number; price: number }) => ({
    t: normalizeTimestamp(o.time),
    v: o.origQty * o.price,
    meta: { side: o.side === 'BUY' ? 1 : -1 },
  }));
}

// ─── Depth Snapshot ──────────────────────────────────────────

export async function fetchDepthSnapshot(
  symbol: string,
): Promise<NormalizedSnapshot | null> {
  const sym = normalizeSymbol(symbol);
  const raw = await readRaw(KnownRawId.DEPTH_L2_20, { symbol: sym }).catch(() => null);
  if (!raw) return null;
  return {
    symbol: sym,
    rawId: KnownRawId.DEPTH_L2_20,
    value: raw.ratio,
    meta: { bidVol: raw.bidVolume, askVol: raw.askVolume },
    updatedAt: Date.now(),
  };
}
