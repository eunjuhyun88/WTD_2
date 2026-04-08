// ═══════════════════════════════════════════════════════════════
// L14: Bollinger Band Squeeze + Expansion (±10)
// ═══════════════════════════════════════════════════════════════
// Detects squeeze (compression), big squeeze (historic compression),
// and expansion with directional bias.

import type { BinanceKline } from '../../types';
import type { L14Result } from '../types';

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

  const squeeze = bbNow.bw < bb20ago.bw * 0.65;
  const bigSqueeze = bb50ago !== null && bbNow.bw < bb50ago.bw * 0.5;
  const expanding = bbNow.bw > bb20ago.bw * 1.3;

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

  return {
    bb_squeeze: squeeze,
    bb_big_squeeze: bigSqueeze,
    bb_expanding: expanding,
    bb_width: Math.round(bbNow.bw * 10000) / 10000,
    bb_pos: Math.round(bbPos * 10) / 10,
    score,
    label,
  };
}
