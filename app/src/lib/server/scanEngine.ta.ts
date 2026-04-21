// ═══════════════════════════════════════════════════════════════
// scanEngine.ta — Technical analysis helpers
// ═══════════════════════════════════════════════════════════════
// Extracted from scanEngine.ts. Stateless, no I/O.

import type { BinanceKline } from '$lib/server/providers/binance';

export function computeSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

export function computeRSI(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeAtrPct(klines: BinanceKline[], period = 14): number | null {
  if (klines.length < period + 1) return null;
  const range = klines.slice(-(period + 1));
  let totalTR = 0;
  for (let i = 1; i < range.length; i++) {
    const prevClose = range[i - 1].close;
    const cur = range[i];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose)
    );
    totalTR += tr;
  }
  const atr = totalTR / period;
  const lastClose = range[range.length - 1].close;
  if (!Number.isFinite(lastClose) || lastClose <= 0) return null;
  return (atr / lastClose) * 100;
}
