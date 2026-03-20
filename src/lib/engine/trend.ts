// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Trend Analysis Engine (pure functions)
// ═══════════════════════════════════════════════════════════════

import type {
  DivergenceSignal,
  MTFAlignment,
  MultiTimeframeTrend,
  TrendAnalysis,
  TrendDirection,
} from './types';

type Pivot = { index: number; value: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNum(value: number): boolean {
  return Number.isFinite(value);
}

function safeSeries(values: number[]): number[] {
  return values.filter(isFiniteNum);
}

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i;
    const y = values[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function toDirection(slope: number): TrendDirection {
  if (slope > 0.005) return 'RISING';
  if (slope < -0.005) return 'FALLING';
  return 'FLAT';
}

function toHighAction(prev: number, next: number): 'HH' | 'LH' {
  return next >= prev ? 'HH' : 'LH';
}

function toLowAction(prev: number, next: number): 'HL' | 'LL' {
  return next >= prev ? 'HL' : 'LL';
}

function findPivots(values: number[], mode: 'high' | 'low', need = 2): Pivot[] {
  const out: Pivot[] = [];
  for (let i = values.length - 2; i >= 1; i -= 1) {
    const prev = values[i - 1];
    const curr = values[i];
    const next = values[i + 1];
    const hit = mode === 'high' ? curr >= prev && curr >= next : curr <= prev && curr <= next;
    if (!hit) continue;
    out.push({ index: i, value: curr });
    if (out.length >= need) break;
  }
  return out.reverse();
}

function buildNoneDivergence(): DivergenceSignal {
  return {
    type: 'NONE',
    indicator: 'GENERIC',
    priceAction: 'HH',
    indicatorAction: 'HH',
    confidence: 0,
    detail: 'No divergence detected.',
  };
}

export function analyzeTrend(values: number[]): TrendAnalysis {
  const series = safeSeries(values);
  if (series.length < 3) {
    const first = series[0] ?? 0;
    const last = series[series.length - 1] ?? first;
    return {
      direction: 'FLAT',
      slope: 0,
      acceleration: 0,
      strength: 0,
      duration: series.length,
      fromValue: first,
      toValue: last,
      changePct: 0,
    };
  }

  const window = series.slice(-Math.min(series.length, 64));
  const first = window[0];
  const last = window[window.length - 1];

  const avgAbs = window.reduce((sum, v) => sum + Math.abs(v), 0) / window.length || 1;
  const slopeRaw = linearSlope(window);
  const slope = clamp((slopeRaw / avgAbs) * 100, -1, 1);

  const half = Math.max(2, Math.floor(window.length / 2));
  const firstHalf = window.slice(0, half);
  const secondHalf = window.slice(-half);
  const firstSlope = linearSlope(firstHalf);
  const secondSlope = linearSlope(secondHalf);
  const acceleration = clamp(((secondSlope - firstSlope) / avgAbs) * 100, -1, 1);

  const changePct = first === 0 ? 0 : ((last - first) / Math.abs(first)) * 100;
  const direction = toDirection(slope);
  const strength = clamp(Math.abs(slope) * 180 + Math.abs(changePct) * 0.7, 0, 100);

  let duration = 1;
  if (direction !== 'FLAT') {
    for (let i = window.length - 1; i >= 1; i -= 1) {
      const delta = window[i] - window[i - 1];
      if ((direction === 'RISING' && delta >= 0) || (direction === 'FALLING' && delta <= 0)) duration += 1;
      else break;
    }
  }

  return {
    direction,
    slope,
    acceleration,
    strength,
    duration,
    fromValue: first,
    toValue: last,
    changePct,
  };
}

export function detectDivergence(prices: number[], indicator: number[]): DivergenceSignal {
  const len = Math.min(prices.length, indicator.length);
  if (len < 8) return buildNoneDivergence();

  const p = prices.slice(-Math.min(len, 96));
  const i = indicator.slice(-Math.min(len, 96));

  const priceHighs = findPivots(p, 'high', 2);
  const indHighs = findPivots(i, 'high', 2);
  const priceLows = findPivots(p, 'low', 2);
  const indLows = findPivots(i, 'low', 2);

  if (priceHighs.length >= 2 && indHighs.length >= 2) {
    const pa = toHighAction(priceHighs[0].value, priceHighs[1].value);
    const ia = toHighAction(indHighs[0].value, indHighs[1].value);
    if (pa === 'HH' && ia === 'LH') {
      const confidence = clamp(
        Math.abs(priceHighs[1].value - priceHighs[0].value) + Math.abs(indHighs[1].value - indHighs[0].value),
        15,
        90
      );
      return {
        type: 'BEARISH_DIV',
        indicator: 'GENERIC',
        priceAction: 'HH',
        indicatorAction: 'LL',
        confidence,
        detail: 'Price made a higher-high while indicator failed to confirm.',
      };
    }
    if (pa === 'LH' && ia === 'HH') {
      const confidence = clamp(
        Math.abs(priceHighs[1].value - priceHighs[0].value) + Math.abs(indHighs[1].value - indHighs[0].value),
        15,
        90
      );
      return {
        type: 'HIDDEN_BEAR',
        indicator: 'GENERIC',
        priceAction: 'LH',
        indicatorAction: 'HH',
        confidence,
        detail: 'Hidden bearish divergence detected.',
      };
    }
  }

  if (priceLows.length >= 2 && indLows.length >= 2) {
    const pa = toLowAction(priceLows[0].value, priceLows[1].value);
    const ia = toLowAction(indLows[0].value, indLows[1].value);
    if (pa === 'LL' && ia === 'HL') {
      const confidence = clamp(
        Math.abs(priceLows[1].value - priceLows[0].value) + Math.abs(indLows[1].value - indLows[0].value),
        15,
        90
      );
      return {
        type: 'BULLISH_DIV',
        indicator: 'GENERIC',
        priceAction: 'LL',
        indicatorAction: 'HL',
        confidence,
        detail: 'Price made a lower-low while indicator formed a higher-low.',
      };
    }
    if (pa === 'HL' && ia === 'LL') {
      const confidence = clamp(
        Math.abs(priceLows[1].value - priceLows[0].value) + Math.abs(indLows[1].value - indLows[0].value),
        15,
        90
      );
      return {
        type: 'HIDDEN_BULL',
        indicator: 'GENERIC',
        priceAction: 'HL',
        indicatorAction: 'LL',
        confidence,
        detail: 'Hidden bullish divergence detected.',
      };
    }
  }

  return buildNoneDivergence();
}

export function analyzeMultiTF(tf1h: number[], tf4h: number[], tf1d: number[]): MultiTimeframeTrend {
  const t1 = analyzeTrend(tf1h);
  const t4 = analyzeTrend(tf4h);
  const td = analyzeTrend(tf1d);

  let alignment: MTFAlignment = 'NEUTRAL';
  const dirs = [t1.direction, t4.direction, td.direction];
  const rising = dirs.filter((d) => d === 'RISING').length;
  const falling = dirs.filter((d) => d === 'FALLING').length;

  if (rising >= 2 && falling === 0) alignment = 'ALIGNED_BULL';
  else if (falling >= 2 && rising === 0) alignment = 'ALIGNED_BEAR';
  else if (rising > 0 && falling > 0) alignment = 'CONFLICTING';

  return {
    tf1h: t1,
    tf4h: t4,
    tf1d: td,
    alignment,
  };
}
