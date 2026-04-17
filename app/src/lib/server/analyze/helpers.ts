import type { BinanceKline } from '$lib/contracts/marketContext';
import type { OIHistoryPoint } from '$lib/server/marketDataService';
import type { ForceOrderLite, BinanceKlineWithTaker } from './types';

export function oiChangePct(oiHistory: OIHistoryPoint[] | null, barsAgo: number): number {
  if (!oiHistory || oiHistory.length < barsAgo + 1) return 0;
  const now = oiHistory[oiHistory.length - 1]?.sumOpenInterest ?? 0;
  const past = oiHistory[Math.max(0, oiHistory.length - 1 - barsAgo)]?.sumOpenInterest ?? 0;
  if (past === 0) return 0;
  return ((now - past) / past) * 100;
}

export function aggregateLiquidations(orders: ForceOrderLite[]): { short_liq_usd: number; long_liq_usd: number } {
  let short_liq_usd = 0;
  let long_liq_usd = 0;
  for (const o of orders) {
    const usd = (o.price || 0) * (o.origQty || 0);
    if (o.side === 'BUY') short_liq_usd += usd;
    else long_liq_usd += usd;
  }
  return { short_liq_usd, long_liq_usd };
}

export function buildDepthView(
  depth: { bids: Array<[number, number]>; asks: Array<[number, number]>; bidVolume: number; askVolume: number; ratio: number } | null,
  maxLevels = 8,
) {
  if (!depth) return null;
  const bidLevels = depth.bids.slice(0, maxLevels).map(([price, qty]) => ({ price, qty, notional: price * qty }));
  const askLevels = depth.asks.slice(0, maxLevels).map(([price, qty]) => ({ price, qty, notional: price * qty }));
  const maxNotional = Math.max(1, ...bidLevels.map((level) => level.notional), ...askLevels.map((level) => level.notional));
  return {
    bids: bidLevels.map((level) => ({ ...level, weight: level.notional / maxNotional })),
    asks: askLevels.map((level) => ({ ...level, weight: level.notional / maxNotional })),
    bidVolume: depth.bidVolume,
    askVolume: depth.askVolume,
    ratio: depth.ratio,
  };
}

export function buildLiquidationClusters(orders: ForceOrderLite[], currentPrice: number, maxClusters = 4) {
  return orders
    .map((order) => {
      const usd = (order.price || 0) * (order.origQty || 0);
      const distancePct = currentPrice > 0 ? ((order.price - currentPrice) / currentPrice) * 100 : 0;
      return { side: order.side, price: order.price, usd, distancePct };
    })
    .filter((cluster) => cluster.usd > 0)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, maxClusters);
}

export function lastPricePct(klines: BinanceKline[]): number {
  if (klines.length < 2) return 0;
  const prev = klines[klines.length - 2].close;
  const curr = klines[klines.length - 1].close;
  return prev > 0 ? ((curr - prev) / prev) * 100 : 0;
}

export function lastTakerRatio(klines: BinanceKlineWithTaker[]): number | undefined {
  const last = klines[klines.length - 1];
  if (!last || last.volume <= 0) return undefined;
  const tbv = last.takerBuyBaseAssetVolume ?? last.volume * 0.5;
  const ratio = tbv / last.volume;
  return Number.isFinite(ratio) ? ratio : undefined;
}
