/**
 * Canonical CVD (Cumulative Volume Delta)
 *
 * Industry standard: CVD = cumulative sum of (taker_buy_vol - taker_sell_vol)
 *
 * When taker volume is available:
 *   delta = takerBuyVol - (totalVol - takerBuyVol)
 *
 * When taker volume is NOT available (fallback):
 *   bodyRatio = |close - open| / (high - low)
 *   buyVol = close >= open ? vol * (0.5 + bodyRatio * 0.5) : vol * (0.5 - bodyRatio * 0.5)
 *   delta = buyVol - (vol - buyVol)
 *
 * Sources: Bookmap, TradingLite, Velo Data, CoinGlass
 */

export interface CvdCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVol?: number; // Binance: takerBuyBaseAssetVolume
}

/** Compute per-candle volume delta */
export function computeVolumeDelta(candle: CvdCandle): number {
  if (candle.takerBuyVol !== undefined) {
    // Canonical: actual taker classification
    const takerSellVol = candle.volume - candle.takerBuyVol;
    return candle.takerBuyVol - takerSellVol;
  }
  // Fallback: body-to-range ratio weighted approximation
  const range = candle.high - candle.low;
  if (range <= 0 || candle.volume <= 0) return 0;
  const bodyRatio = Math.abs(candle.close - candle.open) / range;
  const buyVol =
    candle.close >= candle.open
      ? candle.volume * (0.5 + bodyRatio * 0.5)
      : candle.volume * (0.5 - bodyRatio * 0.5);
  return buyVol - (candle.volume - buyVol);
}

/** Compute cumulative CVD series from candles */
export function computeCVDSeries(candles: CvdCandle[]): number[] {
  const out = new Array(candles.length).fill(0);
  let cvd = 0;
  for (let i = 0; i < candles.length; i++) {
    cvd += computeVolumeDelta(candles[i]);
    out[i] = cvd;
  }
  return out;
}

/** Compute CVD trend (current - baseline) over a rolling window */
export function computeCVDTrend(cvdSeries: number[], window = 20): number {
  if (cvdSeries.length < 2) return 0;
  const baseline = cvdSeries[Math.max(0, cvdSeries.length - 1 - window)] ?? 0;
  const current = cvdSeries[cvdSeries.length - 1] ?? 0;
  return current - baseline;
}

/** Compute taker buy/sell ratio from candles */
export function computeTakerBuySellRatio(candles: CvdCandle[]): {
  buyRatio: number;
  sellRatio: number;
} {
  let totalBuy = 0;
  let totalSell = 0;
  for (const c of candles) {
    if (c.takerBuyVol !== undefined) {
      totalBuy += c.takerBuyVol;
      totalSell += c.volume - c.takerBuyVol;
    } else {
      const range = c.high - c.low;
      if (range <= 0 || c.volume <= 0) continue;
      const bodyRatio = Math.abs(c.close - c.open) / range;
      const buy =
        c.close >= c.open
          ? c.volume * (0.5 + bodyRatio * 0.5)
          : c.volume * (0.5 - bodyRatio * 0.5);
      totalBuy += buy;
      totalSell += c.volume - buy;
    }
  }
  const total = totalBuy + totalSell;
  if (total <= 0) return { buyRatio: 0.5, sellRatio: 0.5 };
  return { buyRatio: totalBuy / total, sellRatio: totalSell / total };
}
