/**
 * Funding Rate Metrics
 *
 * Binance formula:
 * F = Avg(Premium Index) + clamp(Interest Rate - Premium Index, -0.05%, +0.05%)
 *
 * Interest Rate: 0.01% per 8-hour interval (0.03% daily)
 * Settlement: every 8 hours (00:00, 08:00, 16:00 UTC)
 */

/**
 * Convert raw funding rate to multiple display formats.
 *
 * Input: raw 8-hour funding rate (e.g., 0.0001 = 0.01%)
 *
 * Display formats:
 * - 8h rate: raw (e.g., 0.01%)
 * - Daily rate: 8h x 3
 * - Annualized: 8h x 3 x 365
 * - BPS: 8h x 10000
 */
export function convertFundingRate(rate8h: number): {
  rate8h: number;
  rateDaily: number;
  rateAnnualized: number;
  bps: number;
  display8h: string;
  displayDaily: string;
  displayAnnualized: string;
} {
  const daily = rate8h * 3;
  const annual = daily * 365;
  const bps = rate8h * 10_000;

  return {
    rate8h,
    rateDaily: Math.round(daily * 1_000_000) / 1_000_000,
    rateAnnualized: Math.round(annual * 10000) / 10000,
    bps: Math.round(bps * 100) / 100,
    display8h: `${(rate8h * 100).toFixed(4)}%`,
    displayDaily: `${(daily * 100).toFixed(4)}%`,
    displayAnnualized: `${(annual * 100).toFixed(2)}%`,
  };
}

/**
 * Classify funding rate severity.
 * Based on historical BTC funding rate distributions.
 */
export function classifyFundingRate(rate8h: number): {
  severity: 'EXTREME_NEGATIVE' | 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE' | 'EXTREME_POSITIVE';
  pressure: 'SHORT_SQUEEZE_RISK' | 'SHORT_LEAN' | 'BALANCED' | 'LONG_LEAN' | 'LONG_LIQ_RISK';
} {
  let severity: 'EXTREME_NEGATIVE' | 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE' | 'EXTREME_POSITIVE';
  let pressure: 'SHORT_SQUEEZE_RISK' | 'SHORT_LEAN' | 'BALANCED' | 'LONG_LEAN' | 'LONG_LIQ_RISK';

  if (rate8h < -0.001) { severity = 'EXTREME_NEGATIVE'; pressure = 'SHORT_SQUEEZE_RISK'; }
  else if (rate8h < -0.0003) { severity = 'NEGATIVE'; pressure = 'SHORT_LEAN'; }
  else if (rate8h > 0.001) { severity = 'EXTREME_POSITIVE'; pressure = 'LONG_LIQ_RISK'; }
  else if (rate8h > 0.0003) { severity = 'POSITIVE'; pressure = 'LONG_LEAN'; }
  else { severity = 'NEUTRAL'; pressure = 'BALANCED'; }

  return { severity, pressure };
}
