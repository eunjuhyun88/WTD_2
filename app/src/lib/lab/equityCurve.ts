// equityCurve.ts — pure helper: TradeRecord[] + BinanceKline[] → EquityPoint[] per series
// Lookahead-free: BTC Hold uses klines[0].close as entry, klines[n-1].close as exit

import type { TradeRecord, BacktestResult } from '$lib/contracts/backtest';
import type { BinanceKline } from '$lib/contracts/marketContext';

export interface EquityPoint {
  time: number;   // Unix seconds (lightweight-charts format)
  value: number;  // % return, base = 0
}

export interface EquitySeries {
  strategy: EquityPoint[];
  btcHold: EquityPoint[];
  cycles: Array<{ cycleId: string; points: EquityPoint[] }>;
  cycleMarkers: number[]; // Unix seconds where cycle boundaries are
}

// ── BTC buy-and-hold baseline ────────────────────────────────────────────────

export function buildBtcHoldSeries(klines: BinanceKline[]): EquityPoint[] {
  if (klines.length === 0) return [];
  const base = klines[0].close;
  if (!base || base <= 0) return [];
  return klines.map(k => ({
    time: k.time,
    value: parseFloat(((k.close / base - 1) * 100).toFixed(4)),
  }));
}

// ── Strategy equity curve ─────────────────────────────────────────────────────
// Cumulative compounding: each trade's net PnL applied to running equity

export function buildStrategySeries(
  trades: TradeRecord[],
  klines: BinanceKline[],
): EquityPoint[] {
  if (klines.length === 0) return [];

  const sorted = [...trades].sort((a, b) => a.entryBar - b.entryBar);

  // Build a map: bar index → cumulative pnl after that trade exits
  let equity = 0;
  const events: Array<{ time: number; value: number }> = [];

  for (const t of sorted) {
    equity += t.netPnlPercent;
    const exitKline = klines[t.exitBar] ?? klines[klines.length - 1];
    if (exitKline) {
      events.push({ time: exitKline.time, value: parseFloat(equity.toFixed(4)) });
    }
  }

  if (events.length === 0) return [];

  // Bookend: start at 0 before first trade, hold last value to end
  const firstKline = klines[0];
  const lastKline = klines[klines.length - 1];
  const result: EquityPoint[] = [];

  if (firstKline && events[0].time > firstKline.time) {
    result.push({ time: firstKline.time, value: 0 });
  }
  result.push(...events);
  if (lastKline && result[result.length - 1].time < lastKline.time) {
    result.push({ time: lastKline.time, value: result[result.length - 1].value });
  }

  return result;
}

// ── Per-cycle equity (relative, each cycle starts from 0) ────────────────────

export function buildCycleSeries(
  result: BacktestResult,
  klines: BinanceKline[],
): Array<{ cycleId: string; points: EquityPoint[] }> {
  if (!result.cycleBreakdown?.length) return [];

  return result.cycleBreakdown.map(cycle => ({
    cycleId: cycle.cycleId,
    points: buildStrategySeries(cycle.trades, klines),
  }));
}

// ── Cycle boundary markers ────────────────────────────────────────────────────

export function buildCycleMarkers(
  result: BacktestResult,
  klines: BinanceKline[],
): number[] {
  if (!result.cycleBreakdown?.length) return [];
  const markers: number[] = [];

  for (const cycle of result.cycleBreakdown) {
    const firstTrade = [...cycle.trades].sort((a, b) => a.entryBar - b.entryBar)[0];
    if (firstTrade) {
      const k = klines[firstTrade.entryBar];
      if (k) markers.push(k.time);
    }
  }

  return markers;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function buildEquitySeries(
  result: BacktestResult | null,
  klines: BinanceKline[],
): EquitySeries {
  if (!result || klines.length === 0) {
    return { strategy: [], btcHold: [], cycles: [], cycleMarkers: [] };
  }

  return {
    strategy: buildStrategySeries(result.trades, klines),
    btcHold: buildBtcHoldSeries(klines),
    cycles: buildCycleSeries(result, klines),
    cycleMarkers: buildCycleMarkers(result, klines),
  };
}

// ── Format helpers ─────────────────────────────────────────────────────────────

export function fmtPct(v: number, decimals = 2): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
}

export function fmtDuration(holdBars: number, interval: string): string {
  const minutes = intervalToMinutes(interval);
  const totalMin = holdBars * minutes;
  if (totalMin < 60) return `${totalMin}m`;
  if (totalMin < 1440) return `${Math.round(totalMin / 60)}h`;
  return `${(totalMin / 1440).toFixed(1)}d`;
}

function intervalToMinutes(interval: string): number {
  const map: Record<string, number> = {
    '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '2h': 120, '4h': 240, '6h': 360, '8h': 480, '12h': 720,
    '1d': 1440, '3d': 4320, '1w': 10080,
  };
  return map[interval] ?? 60;
}
