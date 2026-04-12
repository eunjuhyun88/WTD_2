import { analyzeTrend } from '../../trend';

/**
 * Compute OI trend direction from OI history points.
 * Returns trend analysis with direction, slope, strength.
 */
export function computeOITrend(oiHistory: Array<{ timestamp: number; oi: number }>): {
  direction: 'RISING' | 'FALLING' | 'FLAT';
  slope: number;
  strength: number;
  changePct: number;
} {
  if (oiHistory.length < 6) return { direction: 'FLAT', slope: 0, strength: 0, changePct: 0 };
  const values = oiHistory.map(p => p.oi);
  const trend = analyzeTrend(values.slice(-20));
  const first = values[0];
  const last = values[values.length - 1];
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  return { direction: trend.direction, slope: trend.slope, strength: trend.strength, changePct };
}

/**
 * OI-Price Convergence/Divergence Detection
 *
 * 4 quadrants:
 * - OI↑ + Price↑ = New longs opening (convergence)
 * - OI↑ + Price↓ = New shorts opening (convergence)
 * - OI↓ + Price↑ = Short covering / weak rally (divergence)
 * - OI↓ + Price↓ = Long unwind / capitulation (divergence)
 *
 * Returns score [-100, +100] and state label.
 */
export function computeOIPriceConvergence(
  oiHistory: Array<{ timestamp: number; oi: number }>,
  closes: number[]
): { score: number; state: string; detail: string } {
  if (oiHistory.length < 10 || closes.length < 10) {
    return { score: 0, state: 'NO_DATA', detail: 'Insufficient OI or price data' };
  }

  const oiValues = oiHistory.slice(-20).map(p => p.oi);
  const priceValues = closes.slice(-20);

  const oiTrend = analyzeTrend(oiValues);
  const priceTrend = analyzeTrend(priceValues);

  let score = 0;
  let state = 'NEUTRAL';

  if (oiTrend.direction === 'RISING' && priceTrend.direction === 'RISING') {
    score = 30 + Math.min(20, Math.round(oiTrend.strength * 0.3));
    state = 'NEW_LONGS';
  } else if (oiTrend.direction === 'RISING' && priceTrend.direction === 'FALLING') {
    score = -30 - Math.min(20, Math.round(oiTrend.strength * 0.3));
    state = 'NEW_SHORTS';
  } else if (oiTrend.direction === 'FALLING' && priceTrend.direction === 'RISING') {
    score = -20 - Math.min(20, Math.round(oiTrend.strength * 0.2));
    state = 'SHORT_COVERING';
  } else if (oiTrend.direction === 'FALLING' && priceTrend.direction === 'FALLING') {
    score = 20 + Math.min(20, Math.round(oiTrend.strength * 0.2));
    state = 'LONG_UNWIND';
  }

  const detail = `OI ${oiTrend.direction} (${oiTrend.changePct.toFixed(1)}%) · Price ${priceTrend.direction} → ${state}`;
  return { score: Math.max(-100, Math.min(100, score)), state, detail };
}

/**
 * OI Divergence (OI trend vs price trend going opposite directions)
 */
export function computeOIDivergence(
  oiHistory: Array<{ timestamp: number; oi: number }>,
  closes: number[]
): { score: number; diverging: boolean; detail: string } {
  const conv = computeOIPriceConvergence(oiHistory, closes);
  const diverging = conv.state === 'SHORT_COVERING' || conv.state === 'LONG_UNWIND';
  return { score: conv.score, diverging, detail: conv.detail };
}
