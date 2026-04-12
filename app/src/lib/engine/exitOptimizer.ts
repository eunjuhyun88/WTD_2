// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Exit Optimizer (B-04)
// ═══════════════════════════════════════════════════════════════
//
// factorEngine 결과 + 시장 데이터를 기반으로 최적 SL/TP를 계산.
// 3가지 프로파일 (Conservative / Balanced / Aggressive) 제공.
//
// 핵심 로직:
//   1. ATR 기반 변동성 앵커
//   2. 지지/저항 수준 (swing highs/lows)
//   3. 피보나치 익스텐션
//   4. 신뢰도(confidence) → TP 확률/EV 보정
//   5. 켈리 사이즈 계산
//
// 외부 의존: types.ts, indicators.ts

import type {
  Direction,
  ExitLevel,
  ExitRecommendation,
  AgentOutput,
  MatchPrediction,
  MarketRegime,
  BinanceKline,
} from './types';
import type { MarketContext } from './factorEngine';
import { calcATR } from './indicators';

// ─── ATR from Klines ────────────────────────────────────────

function klineATR(klines: BinanceKline[], period = 14): number[] {
  return calcATR(
    klines.map((k) => k.high),
    klines.map((k) => k.low),
    klines.map((k) => k.close),
    period,
  );
}

// ─── Constants ──────────────────────────────────────────────

const DEFAULT_ATR_PERIOD = 14;
const SWING_LOOKBACK = 20;

// ATR 배수 by 전략 프로파일
const ATR_SL_MULT = {
  conservative: 1.5,
  balanced: 2.0,
  aggressive: 2.5,
} as const;

const ATR_TP_MULT = {
  conservative: 2.0,
  balanced: 3.0,
  aggressive: 5.0,
} as const;

// 최소 RR 비율 (SL:TP)
const MIN_RR = {
  conservative: 1.2,
  balanced: 1.5,
  aggressive: 2.0,
} as const;

// 기본 승률 (바이너리 옵션 관점, 방향 정확도)
const BASE_WIN_RATE = 0.52;

// Regime별 보정 계수
const REGIME_MULTIPLIER: Record<MarketRegime, { slMult: number; tpMult: number }> = {
  trending_up:   { slMult: 0.9, tpMult: 1.3 },
  trending_down: { slMult: 0.9, tpMult: 1.3 },
  ranging:       { slMult: 1.2, tpMult: 0.8 },
  volatile:      { slMult: 1.4, tpMult: 1.1 },
};

// ─── Helpers ────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(v * factor) / factor;
}

function pricePrecision(price: number): number {
  if (price >= 10000) return 1;
  if (price >= 1000) return 2;
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  return 6;
}

function roundPrice(price: number): number {
  return round(price, pricePrecision(price));
}

// ─── Swing High/Low Detection ───────────────────────────────

interface SwingLevel {
  price: number;
  type: 'high' | 'low';
  index: number;
  strength: number; // 1-3 (how many bars confirmed)
}

function detectSwingLevels(klines: BinanceKline[], lookback = SWING_LOOKBACK): SwingLevel[] {
  const levels: SwingLevel[] = [];
  const n = klines.length;
  if (n < 5) return levels;

  const start = Math.max(0, n - lookback * 3);

  for (let i = start + 2; i < n - 2; i++) {
    const h = klines[i].high;
    const l = klines[i].low;

    // Swing High: higher than 2 bars on each side
    if (
      h > klines[i - 1].high && h > klines[i - 2].high &&
      h > klines[i + 1].high && h > klines[i + 2].high
    ) {
      const strength =
        (h > (klines[i - 3]?.high ?? 0) ? 1 : 0) +
        (h > (klines[i + 3]?.high ?? Infinity) ? 1 : 0) + 1;
      levels.push({ price: h, type: 'high', index: i, strength });
    }

    // Swing Low: lower than 2 bars on each side
    if (
      l < klines[i - 1].low && l < klines[i - 2].low &&
      l < klines[i + 1].low && l < klines[i + 2].low
    ) {
      const strength =
        (l < (klines[i - 3]?.low ?? Infinity) ? 1 : 0) +
        (l < (klines[i + 3]?.low ?? 0) ? 1 : 0) + 1;
      levels.push({ price: l, type: 'low', index: i, strength });
    }
  }

  return levels;
}

// ─── Fibonacci Extensions ───────────────────────────────────

const FIB_LEVELS = [0.382, 0.5, 0.618, 1.0, 1.272, 1.618, 2.0, 2.618];

function fibExtensions(
  direction: Direction,
  swingHigh: number,
  swingLow: number,
  currentPrice: number
): number[] {
  const range = swingHigh - swingLow;
  if (range <= 0 || direction === 'NEUTRAL') return [];

  if (direction === 'LONG') {
    // TP targets above swing high
    return FIB_LEVELS.map((level) => roundPrice(swingHigh + range * level));
  } else {
    // TP targets below swing low
    return FIB_LEVELS.map((level) => roundPrice(swingLow - range * level));
  }
}

// ─── Win Probability Estimation ─────────────────────────────

function estimateWinProbability(
  confidence: number,
  regime: MarketRegime | null,
  direction: Direction,
  agentAgreement: number // 0-1 (에이전트 합의율)
): number {
  // Base from confidence (50-85 → 0.5-0.7)
  let prob = BASE_WIN_RATE + (clamp(confidence, 50, 100) - 50) / 250;

  // Agent agreement bonus
  prob += agentAgreement * 0.08;

  // Regime adjustment
  if (regime === 'trending_up' && direction === 'LONG') prob += 0.05;
  if (regime === 'trending_down' && direction === 'SHORT') prob += 0.05;
  if (regime === 'ranging') prob -= 0.03;
  if (regime === 'volatile') prob -= 0.02;

  return clamp(prob, 0.3, 0.85);
}

// ─── Kelly Criterion ────────────────────────────────────────

function kellySize(winProb: number, rr: number): number {
  // Kelly % = W - (1-W)/R  where W=win prob, R=reward/risk ratio
  const kelly = winProb - (1 - winProb) / rr;
  // 반켈리 적용 (리스크 관리)
  const halfKelly = kelly * 0.5;
  return clamp(round(halfKelly * 100, 1), 0.5, 25); // 0.5% ~ 25%
}

// ─── Expected Value ─────────────────────────────────────────

function calcEV(winProb: number, tpDist: number, slDist: number): number {
  // EV = P(win) * TP거리 - P(loss) * SL거리
  return round(winProb * tpDist - (1 - winProb) * slDist, 4);
}

// ─── Core: Calculate Exit Levels ────────────────────────────

interface ExitOptimizerInput {
  direction: Direction;
  confidence: number;
  currentPrice: number;
  klines: BinanceKline[];
  regime?: MarketRegime | null;
  agentOutputs?: AgentOutput[];
  derivatives?: MarketContext['derivatives'];
}

function calculateSingleExit(
  profile: 'conservative' | 'balanced' | 'aggressive',
  input: ExitOptimizerInput
): ExitLevel {
  const {
    direction,
    confidence,
    currentPrice,
    klines,
    regime,
    agentOutputs,
    derivatives,
  } = input;

  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const atr = klineATR(klines, DEFAULT_ATR_PERIOD);

  // 최근 ATR 값
  const latestATR = getLatestValidValue(atr);
  if (!latestATR || latestATR <= 0) {
    // ATR 없으면 가격의 2% 기반 fallback
    const fallbackPct = { conservative: 0.015, balanced: 0.02, aggressive: 0.03 }[profile];
    const sl = roundPrice(
      direction === 'LONG'
        ? currentPrice * (1 - fallbackPct)
        : currentPrice * (1 + fallbackPct)
    );
    const tp = roundPrice(
      direction === 'LONG'
        ? currentPrice * (1 + fallbackPct * MIN_RR[profile])
        : currentPrice * (1 - fallbackPct * MIN_RR[profile])
    );
    const slDist = Math.abs(currentPrice - sl);
    const tpDist = Math.abs(tp - currentPrice);
    const rr = tpDist / Math.max(slDist, 0.0001);

    return {
      sl,
      tp,
      rr: round(rr, 2),
      tpProb: round(BASE_WIN_RATE * 100, 1),
      ev: calcEV(BASE_WIN_RATE, tpDist, slDist),
    };
  }

  // ── 1. ATR 기반 기본 SL/TP ──
  const regimeMod = regime ? REGIME_MULTIPLIER[regime] : { slMult: 1, tpMult: 1 };

  let slDistance = latestATR * ATR_SL_MULT[profile] * regimeMod.slMult;
  let tpDistance = latestATR * ATR_TP_MULT[profile] * regimeMod.tpMult;

  // ── 2. Swing Level 보정 ──
  const swings = detectSwingLevels(klines);
  if (swings.length > 0) {
    if (direction === 'LONG') {
      // SL: 최근 swing low 아래
      const recentLows = swings
        .filter((s) => s.type === 'low' && s.price < currentPrice)
        .sort((a, b) => b.index - a.index);
      if (recentLows.length > 0) {
        const swingSL = currentPrice - recentLows[0].price;
        // ATR과 swing SL 중 더 넓은 쪽 선택 (보수적)
        slDistance = Math.max(slDistance, swingSL * 1.005);
      }

      // TP: 최근 swing high 위
      const recentHighs = swings
        .filter((s) => s.type === 'high' && s.price > currentPrice)
        .sort((a, b) => a.price - b.price);
      if (recentHighs.length > 0 && profile !== 'aggressive') {
        tpDistance = Math.min(tpDistance, recentHighs[0].price - currentPrice);
      }
    } else if (direction === 'SHORT') {
      const recentHighs = swings
        .filter((s) => s.type === 'high' && s.price > currentPrice)
        .sort((a, b) => b.index - a.index);
      if (recentHighs.length > 0) {
        const swingSL = recentHighs[0].price - currentPrice;
        slDistance = Math.max(slDistance, swingSL * 1.005);
      }

      const recentLows = swings
        .filter((s) => s.type === 'low' && s.price < currentPrice)
        .sort((a, b) => b.price - a.price);
      if (recentLows.length > 0 && profile !== 'aggressive') {
        tpDistance = Math.min(tpDistance, currentPrice - recentLows[0].price);
      }
    }
  }

  // ── 3. Confidence 보정 ──
  // 높은 신뢰도 → SL 약간 타이트, TP 확장
  const confFactor = clamp((confidence - 50) / 100, -0.15, 0.15);
  slDistance *= 1 - confFactor * 0.3;
  tpDistance *= 1 + confFactor * 0.5;

  // ── 4. 파생상품 데이터 보정 ──
  if (derivatives) {
    // 펀딩 레이트가 방향과 반대면 TP 축소
    if (derivatives.funding != null) {
      const fundingAligned =
        (direction === 'LONG' && derivatives.funding > 0.01) ||
        (direction === 'SHORT' && derivatives.funding < -0.01);
      if (!fundingAligned && Math.abs(derivatives.funding ?? 0) > 0.01) {
        tpDistance *= 0.9;
      }
    }

    // LS Ratio 극단값이면 SL 확장
    if (derivatives.lsRatio != null) {
      if (
        (direction === 'LONG' && derivatives.lsRatio > 2.5) ||
        (direction === 'SHORT' && derivatives.lsRatio < 0.4)
      ) {
        slDistance *= 1.15; // 과열 시 SL 여유
      }
    }
  }

  // ── 5. 최소 RR 보장 ──
  const rr = tpDistance / Math.max(slDistance, 0.0001);
  if (rr < MIN_RR[profile]) {
    tpDistance = slDistance * MIN_RR[profile];
  }

  // ── 6. 최종 가격 ──
  const sl = roundPrice(
    direction === 'LONG'
      ? currentPrice - slDistance
      : currentPrice + slDistance
  );
  const tp = roundPrice(
    direction === 'LONG'
      ? currentPrice + tpDistance
      : currentPrice - tpDistance
  );

  // ── 7. TP 확률 + EV ──
  const agentAgreement = computeAgentAgreement(direction, agentOutputs);
  const winProb = estimateWinProbability(confidence, regime ?? null, direction, agentAgreement);
  const finalRR = tpDistance / Math.max(slDistance, 0.0001);
  const ev = calcEV(winProb, tpDistance, slDistance);

  return {
    sl,
    tp,
    rr: round(finalRR, 2),
    tpProb: round(winProb * 100, 1),
    ev,
  };
}

// ─── Agent Agreement ────────────────────────────────────────

function computeAgentAgreement(direction: Direction, outputs?: AgentOutput[]): number {
  if (!outputs || outputs.length === 0) return 0.5;
  const matching = outputs.filter((o) => o.direction === direction).length;
  return matching / outputs.length;
}

// ─── Latest valid value from indicator array ────────────────

function getLatestValidValue(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return null;
}

// ─── Regime Detection ───────────────────────────────────

/**
 * 20-bar 기반 시장 국면 감지
 * @param closes - 종가 배열 (최소 20개 권장)
 */
export function detectRegime(closes: number[]): MarketRegime {
  if (closes.length < 20) return 'ranging';

  const recent = closes.slice(-20);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const changePct = ((last - first) / first) * 100;

  // Volatility: stddev of returns
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push((recent[i] - recent[i - 1]) / recent[i - 1]);
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance) * 100;

  if (volatility > 3) return 'volatile';
  if (changePct > 5) return 'trending_up';
  if (changePct < -5) return 'trending_down';
  return 'ranging';
}

// ─── Public API ─────────────────────────────────────────────

/**
 * 최적 출구 전략 계산 (3가지 프로파일)
 *
 * @param direction - LONG | SHORT | NEUTRAL
 * @param confidence - 0-100 (파이프라인 결과)
 * @param ctx - MarketContext (klines 필수)
 * @param agentOutputs - 에이전트 출력 (선택)
 * @param regime - 시장 국면 (선택)
 */
export function computeExitStrategy(
  direction: Direction,
  confidence: number,
  ctx: MarketContext,
  agentOutputs?: AgentOutput[],
  regime?: MarketRegime | null,
): ExitRecommendation {
  if (direction === 'NEUTRAL' || !ctx.klines.length) {
    return neutralExit(ctx.klines[ctx.klines.length - 1]?.close ?? 0);
  }

  const currentPrice = ctx.klines[ctx.klines.length - 1].close;

  const input: ExitOptimizerInput = {
    direction,
    confidence,
    currentPrice,
    klines: ctx.klines,
    regime,
    agentOutputs,
    derivatives: ctx.derivatives,
  };

  const conservative = calculateSingleExit('conservative', input);
  const balanced = calculateSingleExit('balanced', input);
  const aggressive = calculateSingleExit('aggressive', input);

  // 추천 전략 결정
  const recommended = selectRecommended(confidence, regime, conservative, balanced, aggressive);

  // 켈리 사이즈 (balanced 기준)
  const agentAgreement = computeAgentAgreement(direction, agentOutputs);
  const winProb = estimateWinProbability(confidence, regime ?? null, direction, agentAgreement);
  const kelly = kellySize(winProb, balanced.rr);

  return {
    conservative,
    balanced,
    aggressive,
    recommended,
    kellySize: kelly,
  };
}

/**
 * MatchPrediction에 exit 전략 자동 적용
 */
export function applyExitToPrediction(
  prediction: MatchPrediction,
  ctx: MarketContext,
  agentOutputs?: AgentOutput[],
  regime?: MarketRegime | null,
): MatchPrediction {
  const exit = computeExitStrategy(
    prediction.direction,
    prediction.confidence,
    ctx,
    agentOutputs,
    regime,
  );

  const level = exit[exit.recommended];

  return {
    ...prediction,
    exitStrategy: exit.recommended,
    slPrice: level.sl,
    tpPrice: level.tp,
  };
}

/**
 * 현재 가격 대비 SL/TP 히트 판정
 */
export function checkExitHit(
  direction: Direction,
  currentPrice: number,
  sl: number,
  tp: number,
): 'SL_HIT' | 'TP_HIT' | 'OPEN' {
  if (direction === 'LONG') {
    if (currentPrice <= sl) return 'SL_HIT';
    if (currentPrice >= tp) return 'TP_HIT';
  } else if (direction === 'SHORT') {
    if (currentPrice >= sl) return 'SL_HIT';
    if (currentPrice <= tp) return 'TP_HIT';
  }
  return 'OPEN';
}

/**
 * 트레일링 스탑 계산 (포지션 진입 후)
 */
export function computeTrailingStop(
  direction: Direction,
  entryPrice: number,
  currentPrice: number,
  currentSL: number,
  klines: BinanceKline[],
  trailPercent = 0.5, // ATR 기반 트레일링 %
): number {
  const atr = klineATR(klines, DEFAULT_ATR_PERIOD);
  const latestATR = getLatestValidValue(atr);
  if (!latestATR) return currentSL;

  const trailDistance = latestATR * trailPercent;

  if (direction === 'LONG') {
    // 가격이 올라갔을 때만 SL 올림
    const newSL = roundPrice(currentPrice - trailDistance);
    return Math.max(currentSL, newSL);
  } else {
    // 가격이 내려갔을 때만 SL 내림
    const newSL = roundPrice(currentPrice + trailDistance);
    return Math.min(currentSL, newSL);
  }
}

/**
 * 부분 익절 레벨 계산 (3단계)
 */
export function computePartialTakeProfits(
  direction: Direction,
  entryPrice: number,
  tp: number,
): { level: number; price: number; sizePercent: number }[] {
  const totalDist = Math.abs(tp - entryPrice);

  const levels = [
    { pct: 0.33, size: 30 }, // 33% 도달 시 30% 익절
    { pct: 0.66, size: 30 }, // 66% 도달 시 30% 추가 익절
    { pct: 1.0, size: 40 },  // 100% 도달 시 나머지 40%
  ];

  return levels.map((l, i) => ({
    level: i + 1,
    price: roundPrice(
      direction === 'LONG'
        ? entryPrice + totalDist * l.pct
        : entryPrice - totalDist * l.pct
    ),
    sizePercent: l.size,
  }));
}

// ─── Internal Helpers ───────────────────────────────────────

function neutralExit(price: number): ExitRecommendation {
  const level: ExitLevel = { sl: price, tp: price, rr: 0, tpProb: 0, ev: 0 };
  return {
    conservative: level,
    balanced: level,
    aggressive: level,
    recommended: 'balanced',
    kellySize: 0,
  };
}

function selectRecommended(
  confidence: number,
  regime: MarketRegime | null | undefined,
  conservative: ExitLevel,
  balanced: ExitLevel,
  aggressive: ExitLevel,
): 'conservative' | 'balanced' | 'aggressive' {
  // 높은 신뢰도 + 트렌딩 → aggressive
  if (confidence >= 80 && (regime === 'trending_up' || regime === 'trending_down')) {
    if (aggressive.ev > 0) return 'aggressive';
  }

  // 중간 신뢰도 → balanced
  if (confidence >= 60 && balanced.ev > 0) return 'balanced';

  // 변동성 높거나 레인징 → conservative
  if (regime === 'volatile' || regime === 'ranging') return 'conservative';

  // EV 기반 최적 선택
  const candidates = [
    { profile: 'conservative' as const, ev: conservative.ev },
    { profile: 'balanced' as const, ev: balanced.ev },
    { profile: 'aggressive' as const, ev: aggressive.ev },
  ].filter((c) => c.ev > 0);

  if (candidates.length === 0) return 'conservative';
  candidates.sort((a, b) => b.ev - a.ev);
  return candidates[0].profile;
}
