// ═══════════════════════════════════════════════════════════════
// L14: Bollinger Band Squeeze + Expansion (±10)
// ═══════════════════════════════════════════════════════════════
// Detects squeeze (compression), big squeeze (historic compression),
// and expansion with directional bias.

import type { BinanceKline } from '../../types.ts';
import type { L14Result } from '../types.ts';
import { EventId, type EventPayload } from '../../../contracts/events.ts';
import { EventDirection, EventSeverity } from '../../../contracts/ids.ts';
import { Thresholds } from '../thresholds.ts';

// E6b — L14 thresholds (dissection §4.3 lines 1437-1486) now live
// in the central engine threshold registry. The previous pinned
// constants (BB_SQUEEZE_RATIO_20 / BB_BIG_SQUEEZE_RATIO_50 /
// BB_EXPANSION_RATIO) are deleted; every reference reads from
// `Thresholds.bb.*`. The `calcBB` defaults now point at the
// registry too, so any future drift in `bb_period` / `bb_std_mult`
// flows through one place.

function calcBB(
  closes: number[],
  period: number = Thresholds.bb.bb_period,
  mult: number = Thresholds.bb.bb_std_mult,
) {
  if (closes.length < period) return { sma: 0, upper: 0, lower: 0, bw: 0 };

  const slice = closes.slice(-period);
  const sma = slice.reduce((s, v) => s + v, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - sma) ** 2, 0) / period);

  return {
    sma,
    upper: sma + mult * std,
    lower: sma - mult * std,
    bw: sma > 0 ? (4 * mult * std) / sma : 0,
  };
}

export function computeL14BbSqueeze(klines: BinanceKline[]): L14Result {
  const none: L14Result = {
    bb_squeeze: false, bb_big_squeeze: false, bb_expanding: false,
    bb_width: 0, bb_pos: 50, score: 0, label: 'NO DATA',
    events: [],
  };

  if (klines.length < Thresholds.bb.bb_min_klines) return none;

  const closes = klines.map(k => k.close);
  const cp = closes[closes.length - 1];

  // Current BB — registry-defined period/multiplier flow through
  // calcBB defaults; the explicit args here are intentional so a
  // grep for the constants finds every consumer.
  const bbNow = calcBB(closes, Thresholds.bb.bb_period, Thresholds.bb.bb_std_mult);
  if (bbNow.sma <= 0) return none;

  // BB from 20 candles ago
  const bb20ago = closes.length > Thresholds.bb.bb_lookback_20_floor
    ? calcBB(closes.slice(0, -20), Thresholds.bb.bb_period, Thresholds.bb.bb_std_mult)
    : bbNow;

  // BB from 50 candles ago (for big squeeze)
  const bb50ago = closes.length > Thresholds.bb.bb_lookback_50_floor
    ? calcBB(closes.slice(0, -50), Thresholds.bb.bb_period, Thresholds.bb.bb_std_mult)
    : null;

  const squeeze = bbNow.bw < bb20ago.bw * Thresholds.bb.bb_squeeze_ratio_20;
  const bigSqueeze = bb50ago !== null && bbNow.bw < bb50ago.bw * Thresholds.bb.bb_big_squeeze_ratio_50;
  const expanding = bbNow.bw > bb20ago.bw * Thresholds.bb.bb_expansion_ratio;

  const bbRange = bbNow.upper - bbNow.lower || 1;
  const bbPos = ((cp - bbNow.lower) / bbRange) * 100;

  let score = 0;
  let label = 'NORMAL';

  if (bigSqueeze) {
    score = cp > bbNow.sma ? 8 : 4;
    label = 'BIG SQUEEZE';
  } else if (squeeze) {
    score = cp > bbNow.sma ? 5 : 2;
    label = 'SQUEEZE';
  } else if (expanding && cp > bbNow.upper) {
    score = 8;
    label = 'UPPER BREAKOUT + EXPAND';
  } else if (expanding && cp < bbNow.lower) {
    score = -8;
    label = 'LOWER BREAK + EXPAND';
  } else if (bbPos > 85) {
    score = -3;
    label = 'OVERBOUGHT ZONE';
  } else if (bbPos < 15) {
    score = 3;
    label = 'OVERSOLD ZONE';
  } else {
    label = 'NORMAL';
  }

  // E3b — typed events for downstream verdictBuilder consumption.
  // Events are context-direction (not bull/bear) because BB volatility
  // state is an information signal, not a directional call on its own.
  // The verdict layer partitions context events into top_reasons
  // regardless of resolved bias.
  const events: EventPayload[] = [];
  const bb20bw = bb20ago.bw > 0 ? bbNow.bw / bb20ago.bw : 0;
  const bb50bw = bb50ago && bb50ago.bw > 0 ? bbNow.bw / bb50ago.bw : 0;

  if (bigSqueeze) {
    events.push({
      id: EventId.BB_BIG_SQUEEZE,
      direction: EventDirection.CONTEXT,
      severity: EventSeverity.HIGH,
      note: 'Historic BB compression — energy storage before move',
      data: {
        bandwidth: Math.max(0, bbNow.bw),
        bandwidth_ratio_50: Math.max(0, bb50bw),
      },
    });
  }
  if (squeeze) {
    events.push({
      id: EventId.BB_SQUEEZE,
      direction: EventDirection.CONTEXT,
      severity: EventSeverity.MEDIUM,
      note: 'BB compressed vs 20-bar prior',
      data: {
        bandwidth: Math.max(0, bbNow.bw),
        bandwidth_ratio_20: Math.max(0, bb20bw),
      },
    });
  }
  if (expanding) {
    events.push({
      id: EventId.BB_EXPANSION,
      direction: EventDirection.CONTEXT,
      severity: EventSeverity.MEDIUM,
      note: 'BB expansion after compression — directional move in progress',
      data: {
        bandwidth: Math.max(0, bbNow.bw),
        expansion_ratio: bb20bw > 0 ? bb20bw : 1,
      },
    });
  }

  return {
    bb_squeeze: squeeze,
    bb_big_squeeze: bigSqueeze,
    bb_expanding: expanding,
    bb_width: Math.round(bbNow.bw * 10000) / 10000,
    bb_pos: Math.round(bbPos * 10) / 10,
    score,
    label,
    events,
  };
}
