/**
 * Canonical Buy/Sell Ratio
 *
 * Industry standard: uses taker buy/sell volume classification.
 * Binance aggTrades: isBuyerMaker=false means taker buy.
 *
 * When taker volume available:
 *   buyRatio = takerBuyVol / totalVol
 *   sellRatio = 1 - buyRatio
 *
 * When not available (fallback):
 *   Uses body-to-range ratio weighted approximation per candle.
 *   This is the same fallback as CVD canonical.
 */

import { computeTakerBuySellRatio, type CvdCandle } from './cvd';

// Re-export the taker buy/sell ratio from CVD module (same formula)
export { computeTakerBuySellRatio };

/**
 * Compute buy/sell ratio for a window of candles.
 * Returns { buyRatio, sellRatio, score } where score is [-70, +70].
 *
 * Score mapping:
 *   ratio > 0.65: +70 (strong buy dominance)
 *   ratio > 0.55: +30 (buy lean)
 *   ratio < 0.35: -70 (strong sell dominance)
 *   ratio < 0.45: -30 (sell lean)
 *   else: proportional to (ratio - 0.5) * 200
 */
export function computeBuySellScore(candles: CvdCandle[]): {
  buyRatio: number;
  sellRatio: number;
  score: number;
  label: string;
} {
  const { buyRatio, sellRatio } = computeTakerBuySellRatio(candles);

  let score: number;
  let label: string;

  if (buyRatio > 0.65) { score = 70; label = 'STRONG BUY DOMINANCE'; }
  else if (buyRatio > 0.55) { score = 30; label = 'BUY LEAN'; }
  else if (buyRatio < 0.35) { score = -70; label = 'STRONG SELL DOMINANCE'; }
  else if (buyRatio < 0.45) { score = -30; label = 'SELL LEAN'; }
  else {
    score = Math.round((buyRatio - 0.5) * 200);
    label = score > 15 ? 'BUY LEAN' : score < -15 ? 'SELL LEAN' : 'BALANCED';
  }

  return { buyRatio, sellRatio, score, label };
}
