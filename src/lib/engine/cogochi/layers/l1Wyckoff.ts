// ═══════════════════════════════════════════════════════════════
// L1: Wyckoff v3 — Multi-window Phase Detection (±28)
// ═══════════════════════════════════════════════════════════════
// Tests multiple {Range, Trend} window configs to find best fit.
// Detects Spring/UTAD/SOS/SOW events. Calculates C&E target.

import type { BinanceKline } from '../../types';
import type { L1Result, WyckoffPhase } from '../types';
import { Thresholds } from '../thresholds';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

interface WindowConfig {
  rangeLen: number;
  trendLen: number;
}

const WINDOW_CONFIGS: WindowConfig[] = [
  { rangeLen: 30, trendLen: 40 },
  { rangeLen: 35, trendLen: 50 },
  { rangeLen: 40, trendLen: 55 },
  { rangeLen: 45, trendLen: 60 },
  { rangeLen: 50, trendLen: 65 },
  { rangeLen: 55, trendLen: 75 },
];

interface WyckoffCandle {
  o: number; h: number; l: number; c: number; v: number;
}

function toWC(k: BinanceKline): WyckoffCandle {
  return { o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume };
}

interface WyckoffAnalysis {
  pattern: 'ACCUMULATION' | 'DISTRIBUTION' | 'NONE';
  score: number;
  hasSpring: boolean;
  hasUtad: boolean;
  hasSos: boolean;
  hasSow: boolean;
  rangeHigh: number;
  rangeLow: number;
  trendPct: number;
}

function analyzeWindow(candles: WyckoffCandle[], cfg: WindowConfig): WyckoffAnalysis {
  const none: WyckoffAnalysis = {
    pattern: 'NONE', score: 0, hasSpring: false, hasUtad: false,
    hasSos: false, hasSow: false, rangeHigh: 0, rangeLow: 0, trendPct: 0,
  };

  if (candles.length < cfg.rangeLen + cfg.trendLen) return none;

  const total = candles.length;
  const trendSlice = candles.slice(total - cfg.rangeLen - cfg.trendLen, total - cfg.rangeLen);
  const rangeSlice = candles.slice(total - cfg.rangeLen);

  // Trend direction
  const tStart = trendSlice[0].c;
  const tEnd = trendSlice[trendSlice.length - 1].c;
  const tPct = tStart > 0 ? (tEnd - tStart) / tStart : 0;

  // Range boundaries
  const rH = Math.max(...rangeSlice.map(c => c.h));
  const rL = Math.min(...rangeSlice.map(c => c.l));
  const rPct = rL > 0 ? ((rH - rL) / rL) * 100 : 0;

  // Validate range: 1.5% ~ 38%
  if (rPct < Thresholds.wyckoff.range_pct_min || rPct > Thresholds.wyckoff.range_pct_max) return none;

  // Determine pattern
  let pattern: 'ACCUMULATION' | 'DISTRIBUTION' | 'NONE' = 'NONE';
  if (tPct < -Thresholds.wyckoff.trend_threshold) pattern = 'ACCUMULATION';
  else if (tPct > Thresholds.wyckoff.trend_threshold) pattern = 'DISTRIBUTION';
  else return none;

  // Base score
  let s = pattern === 'ACCUMULATION' ? Thresholds.wyckoff.score_base : -Thresholds.wyckoff.score_base;

  // Climax volume (first 5 candles of range vs range average)
  const avgVol = rangeSlice.reduce((a, c) => a + c.v, 0) / rangeSlice.length;
  const firstVols = rangeSlice.slice(0, 5);
  const climVol = Math.max(...firstVols.map(c => c.v));
  const climVolRel = avgVol > 0 ? climVol / avgVol : 0;

  if (climVolRel >= Thresholds.wyckoff.clim_vol_extreme) s += pattern === 'ACCUMULATION' ? 10 : -10;
  else if (climVolRel >= Thresholds.wyckoff.clim_vol_strong) s += pattern === 'ACCUMULATION' ? 7 : -7;
  else if (climVolRel >= Thresholds.wyckoff.clim_vol_moderate) s += pattern === 'ACCUMULATION' ? 4 : -4;

  // ST (Secondary Test) counting
  let stCount = 0;
  let stVolQ = 0;
  for (let i = 5; i < rangeSlice.length - 7; i++) {
    const c = rangeSlice[i];
    if (pattern === 'ACCUMULATION') {
      if (c.l <= rL * Thresholds.wyckoff.st_near_low_pct && c.c > rL) {
        stCount++;
        if (c.v < avgVol * Thresholds.wyckoff.st_low_vol_ratio) stVolQ++;
      }
    } else {
      if (c.h >= rH * Thresholds.wyckoff.st_near_high_pct && c.c < rH) {
        stCount++;
        if (c.v < avgVol * Thresholds.wyckoff.st_low_vol_ratio) stVolQ++;
      }
    }
  }
  const stPts = Math.min(8, stCount * 2 + stVolQ * 2);
  s += pattern === 'ACCUMULATION' ? stPts : -stPts;

  // Spring / UTAD detection (last 10 candles)
  let hasSpring = false;
  let hasUtad = false;
  let springLowVol = false;
  let utadLowVol = false;

  for (const c of rangeSlice.slice(-10)) {
    // Spring: dip below range low then recover
    if (c.l < rL * Thresholds.wyckoff.spring_dip_pct && c.c > rL * Thresholds.wyckoff.spring_recover_pct) {
      hasSpring = true;
      if (c.v < avgVol * 0.9) springLowVol = true;
    }
    // UTAD: spike above range high then pull back
    if (c.h > rH * Thresholds.wyckoff.utad_spike_pct && c.c < rH * Thresholds.wyckoff.utad_pullback_pct) {
      hasUtad = true;
      if (c.v < avgVol * 0.9) utadLowVol = true;
    }
  }

  if (hasSpring && pattern === 'ACCUMULATION') {
    s += springLowVol ? 9 : 6;
  }
  if (hasUtad && pattern === 'DISTRIBUTION') {
    s += utadLowVol ? -9 : -6;
  }

  // SOS/SOW (last 7 candles)
  let hasSos = false;
  let hasSow = false;
  for (const c of rangeSlice.slice(-7)) {
    if (pattern === 'ACCUMULATION' && c.c > rH * Thresholds.wyckoff.sos_break_pct && c.c > c.o && c.v > avgVol * 1.1) {
      hasSos = true;
    }
    if (pattern === 'DISTRIBUTION' && c.c < rL * Thresholds.wyckoff.sow_break_pct && c.c < c.o && c.v > avgVol * 1.1) {
      hasSow = true;
    }
  }
  if (hasSos) s += 6;
  if (hasSow) s -= 6;

  // Volume decrease confirmation
  const firstHalfVol = rangeSlice.slice(0, Math.floor(rangeSlice.length / 2));
  const secondHalfVol = rangeSlice.slice(Math.floor(rangeSlice.length / 2));
  const fhAvg = firstHalfVol.reduce((a, c) => a + c.v, 0) / firstHalfVol.length;
  const shAvg = secondHalfVol.reduce((a, c) => a + c.v, 0) / secondHalfVol.length;
  const volDec = fhAvg > 0 && shAvg < fhAvg * Thresholds.wyckoff.vol_decrease_ratio;
  if (volDec) s += pattern === 'ACCUMULATION' ? 4 : -4;

  // Trend strength bonus
  const tBonus = Math.min(5, Math.round(Math.abs(tPct) * 25));
  s += pattern === 'ACCUMULATION' ? tBonus : -tBonus;

  return {
    pattern,
    score: clamp(Math.round(s), -Thresholds.wyckoff.score_max, Thresholds.wyckoff.score_max),
    hasSpring,
    hasUtad,
    hasSos,
    hasSow,
    rangeHigh: rH,
    rangeLow: rL,
    trendPct: tPct,
  };
}

export function computeL1Wyckoff(klines: BinanceKline[]): L1Result {
  if (klines.length < 80) {
    return { phase: 'NONE', pattern: 'insufficient data', score: 0 };
  }

  const candles = klines.map(toWC);

  // Try all window configs, pick best absolute score
  let best: WyckoffAnalysis | null = null;

  for (const cfg of WINDOW_CONFIGS) {
    const result = analyzeWindow(candles, cfg);
    if (result.pattern === 'NONE') continue;
    if (!best || Math.abs(result.score) > Math.abs(best.score)) {
      best = result;
    }
  }

  if (!best || best.pattern === 'NONE') {
    // Fallback: simple SMA slope
    const closes = klines.map(k => k.close);
    const recent20 = closes.slice(-20);
    const smaStart = recent20.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const smaEnd = recent20.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const slope = smaStart > 0 ? (smaEnd - smaStart) / smaStart : 0;

    if (slope > 0.01) return { phase: 'MARKUP', pattern: 'trend up', score: 10 };
    if (slope < -0.01) return { phase: 'MARKDOWN', pattern: 'trend down', score: -10 };
    return { phase: 'NONE', pattern: 'no pattern', score: 0 };
  }

  const phase: WyckoffPhase = best.pattern === 'ACCUMULATION' ? 'ACCUMULATION' : 'DISTRIBUTION';

  // C&E target price
  let ceTarget: number | undefined;
  const rangeWidth = best.rangeHigh - best.rangeLow;
  if (phase === 'ACCUMULATION') {
    ceTarget = best.rangeHigh + rangeWidth; // × 1.0
  } else {
    ceTarget = best.rangeLow - rangeWidth;
  }

  let patternStr = phase;
  if (best.hasSpring) patternStr += ' w/Spring';
  if (best.hasUtad) patternStr += ' w/UTAD';
  if (best.hasSos) patternStr += ' + SOS';
  if (best.hasSow) patternStr += ' + SOW';

  return {
    phase,
    pattern: patternStr,
    score: best.score,
    hasSpring: best.hasSpring,
    hasUtad: best.hasUtad,
    hasSos: best.hasSos,
    hasSow: best.hasSow,
    ceTarget,
  };
}
