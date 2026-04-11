// ═══════════════════════════════════════════════════════════════
// L14: Bollinger Band Squeeze + Expansion (±10)
// ═══════════════════════════════════════════════════════════════
// Detects squeeze (compression), big squeeze (historic compression),
// and expansion with directional bias.

import type { BinanceKline } from '../../types.ts';
import type { L14Result } from '../types.ts';
import { EventId, type EventPayload } from '../../../contracts/events.ts';
import { EventDirection, EventSeverity } from '../../../contracts/ids.ts';

// Pinned thresholds from dissection §4 L14 row — lifted to named
// constants so E6 registry migration can move them without touching
// the layer body.
const BB_SQUEEZE_RATIO_20 = 0.65;
const BB_BIG_SQUEEZE_RATIO_50 = 0.5;
const BB_EXPANSION_RATIO = 1.3;

function calcBB(closes: number[], period = 20, mult = 2.0) {
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

  if (klines.length < 25) return none;

  const closes = klines.map(k => k.close);
  const cp = closes[closes.length - 1];

  // Current BB
  const bbNow = calcBB(closes, 20, 2.0);
  if (bbNow.sma <= 0) return none;

  // BB from 20 candles ago
  const bb20ago = closes.length > 40
    ? calcBB(closes.slice(0, -20), 20, 2.0)
    : bbNow;

  // BB from 50 candles ago (for big squeeze)
  const bb50ago = closes.length > 70
    ? calcBB(closes.slice(0, -50), 20, 2.0)
    : null;

  const squeeze = bbNow.bw < bb20ago.bw * BB_SQUEEZE_RATIO_20;
  const bigSqueeze = bb50ago !== null && bbNow.bw < bb50ago.bw * BB_BIG_SQUEEZE_RATIO_50;
  const expanding = bbNow.bw > bb20ago.bw * BB_EXPANSION_RATIO;

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
