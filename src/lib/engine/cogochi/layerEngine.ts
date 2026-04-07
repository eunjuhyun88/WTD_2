// ═══════════════════════════════════════════════════════════════
// COGOCHI — 15-Layer Engine
// ═══════════════════════════════════════════════════════════════
// 기존 factorEngine 48팩터를 15레이어로 리매핑.
// 미구현 레이어(L1 와이코프, L3 V-Surge, L13 돌파, L14 BB스퀴즈)는
// 새로운 전용 모듈로 구현.
//
// 설계 원칙:
// - 기존 factorEngine.ts는 건드리지 않음
// - computeFactor()를 호출해서 기존 결과 재활용
// - 새 레이어는 klines 직접 분석

import type { MarketContext } from '../factorEngine';
import { computeFactor } from '../factorEngine';
import { calcCVD, calcATR } from '../indicators';
import { detectDivergence, analyzeTrend } from '../trend';

import type {
  SignalSnapshot,
  L1Result, L2Result, L3Result, L4Result, L5Result,
  L6Result, L7Result, L8Result, L9Result, L10Result,
  L11Result, L12Result, L13Result, L14Result, L15Result,
  CvdState, MtfConfluence, Regime, AlphaLabel,
} from './types';

import { computeL1Wyckoff } from './layers/l1Wyckoff';
import { computeL3VSurge } from './layers/l3VSurge';
import { computeL13Breakout } from './layers/l13Breakout';
import { computeL14BbSqueeze } from './layers/l14BbSqueeze';
import { computeAlphaScore, toAlphaLabel } from './alphaScore';
// HMAC is server-only (node:crypto). Import dynamically to avoid client bundle issues.
let _signSnapshot: ((s: SignalSnapshot) => string) | null = null;
async function getSignFn() {
  if (!_signSnapshot) {
    try {
      const mod = await import('./hmac');
      _signSnapshot = mod.signSnapshot;
    } catch {
      _signSnapshot = () => 'no-hmac';
    }
  }
  return _signSnapshot;
}

// ─── Helpers ─────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function factorValue(factorId: string, ctx: MarketContext): number {
  return computeFactor(factorId, ctx).value;
}

function factorRaw(factorId: string, ctx: MarketContext): number | undefined {
  const r = computeFactor(factorId, ctx);
  return 'rawValue' in r ? (r as { rawValue?: number }).rawValue : undefined;
}

// ─── Layer Computers ─────────────────────────────────────────

function computeL2(ctx: MarketContext): L2Result {
  const fr = ctx.derivatives?.funding ?? 0;
  const oiChange = ctx.derivatives?.oi ? 0 : 0; // OI time-series 미구현 → 0
  const lsRatio = ctx.derivatives?.lsRatio ?? 1.0;

  // 기존 팩터 4개의 가중 합산
  const frScore = factorValue('FR_TREND', ctx);          // ±50 범위
  const oiScore = factorValue('OI_PRICE_CONV', ctx);     // ±30 범위
  const lsScore = factorValue('LS_RATIO_TREND', ctx);    // ±40 범위
  const sqScore = factorValue('SQUEEZE_SIGNAL', ctx);    // ±70 범위

  // 정규화: 4개 합산(최대 ±190) → ±20으로 스케일
  const raw = frScore * 0.35 + oiScore * 0.15 + lsScore * 0.25 + sqScore * 0.25;
  const score = clamp(Math.round(raw * 20 / 50), -20, 20);

  return {
    fr,
    oi_change: oiChange,
    ls_ratio: lsRatio,
    score,
  };
}

function computeL4(ctx: MarketContext): L4Result {
  const bsScore = factorValue('BUY_SELL_RATIO', ctx);
  const raw = factorRaw('BUY_SELL_RATIO', ctx) ?? 0.5;

  return {
    bid_ask_ratio: Math.round(raw * 100) / 100,
    score: clamp(Math.round(bsScore * 10 / 70), -10, 10),
  };
}

function computeL5(ctx: MarketContext): L5Result {
  const liqScore = factorValue('LIQUIDATION_TREND', ctx);
  const pdScore = factorValue('PREMIUM_DISCOUNT', ctx);

  // basis_pct: spot-futures 가격 차이 (근사값)
  const basisPct = ctx.derivatives?.funding
    ? Math.abs(ctx.derivatives.funding) * 100
    : 0;

  const score = clamp(Math.round((liqScore * 0.6 + pdScore * 0.4) * 10 / 70), -10, 10);

  return {
    basis_pct: Math.round(basisPct * 10000) / 10000,
    score,
  };
}

function computeL6(ctx: MarketContext): L6Result {
  const exchangeFlow = factorValue('EXCHANGE_FLOW', ctx);
  const whale = factorValue('WHALE_ACTIVITY', ctx);
  const miner = factorValue('MINER_FLOW', ctx);
  const etf = factorValue('ETF_FLOW', ctx);

  const raw = exchangeFlow * 0.35 + whale * 0.25 + miner * 0.15 + etf * 0.25;
  const score = clamp(Math.round(raw * 8 / 70), -8, 8);

  return {
    exchange_netflow: (factorRaw('EXCHANGE_FLOW', ctx) ?? 0),
    score,
  };
}

function computeL7(ctx: MarketContext): L7Result {
  const fgScore = factorValue('FG_TREND', ctx);
  const contrarian = factorValue('CONTRARIAN_SIGNAL', ctx);
  const fearGreed = ctx.sentiment?.fearGreed ?? 50;

  // FG_TREND은 순방향, CONTRARIAN은 역방향 — 혼합
  const raw = fgScore * 0.4 + contrarian * 0.6;
  const score = clamp(Math.round(raw * 10 / 70), -10, 10);

  return {
    fear_greed: fearGreed,
    score,
  };
}

function computeL8(ctx: MarketContext): L8Result {
  // 김치프리미엄: 현재 MarketContext에 없음 → Phase 1b에서 추가
  // 지금은 0으로 반환
  return {
    kimchi: 0,
    score: 0,
  };
}

function computeL9(ctx: MarketContext): L9Result {
  const liqLong = ctx.derivatives?.liqLong ?? 0;
  const liqShort = ctx.derivatives?.liqShort ?? 0;
  const liq1h = liqLong + liqShort;

  const liqScore = factorValue('LIQUIDATION_TREND', ctx);
  const score = clamp(Math.round(liqScore * 10 / 70), -10, 10);

  return {
    liq_1h: liq1h,
    score,
  };
}

function computeL10(ctx: MarketContext): L10Result {
  const mtfScore = factorValue('MTF_ALIGNMENT', ctx);

  let confluence: MtfConfluence;
  if (mtfScore >= 30) confluence = 'BULL_ALIGNED';
  else if (mtfScore <= -30) confluence = 'BEAR_ALIGNED';
  else confluence = 'MIXED';

  const score = clamp(Math.round(mtfScore * 20 / 70), -20, 20);

  return {
    mtf_confluence: confluence,
    score,
  };
}

function computeL11(ctx: MarketContext): L11Result {
  const closes = ctx.klines.map(k => k.close);
  const volumes = ctx.klines.map(k => k.volume);

  // CVD raw 계산
  const cvdArr = calcCVD(closes, volumes);
  const cvdRaw = cvdArr.length > 0 ? cvdArr[cvdArr.length - 1] : 0;

  // CVD trend
  const cvdTrendScore = factorValue('CVD_TREND', ctx);
  const volDivScore = factorValue('VOL_DIVERGENCE', ctx);

  // CVD divergence 감지
  const validCvd = cvdArr.filter(Number.isFinite);
  let hasDivergence = false;
  if (validCvd.length >= 20 && closes.length >= 20) {
    const div = detectDivergence(closes.slice(-60), validCvd.slice(-60));
    hasDivergence = div.type !== 'NONE';
  }

  // State 결정
  let cvdState: CvdState;
  if (hasDivergence && cvdTrendScore > 0) cvdState = 'BULLISH_DIVERGENCE';
  else if (hasDivergence && cvdTrendScore < 0) cvdState = 'BEARISH_DIVERGENCE';
  else if (cvdTrendScore > 20) cvdState = 'BULLISH';
  else if (cvdTrendScore < -20) cvdState = 'BEARISH';
  else cvdState = 'NEUTRAL';

  const raw = cvdTrendScore * 0.6 + volDivScore * 0.4;
  const score = clamp(Math.round(raw * 25 / 80), -25, 25);

  return {
    cvd_state: cvdState,
    cvd_raw: Math.round(cvdRaw),
    score,
  };
}

function computeL12(ctx: MarketContext): L12Result {
  const stableFlow = factorValue('STABLECOIN_FLOW', ctx);
  const stableMcap = factorValue('STABLECOIN_MCAP', ctx);

  const raw = stableFlow * 0.5 + stableMcap * 0.5;
  const score = clamp(Math.round(raw * 5 / 50), -5, 5);

  let sectorFlow: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
  if (score > 1) sectorFlow = 'INFLOW';
  else if (score < -1) sectorFlow = 'OUTFLOW';
  else sectorFlow = 'NEUTRAL';

  return {
    sector_flow: sectorFlow,
    score,
  };
}

function computeL15(ctx: MarketContext): L15Result {
  const closes = ctx.klines.map(k => k.close);
  const highs = ctx.klines.map(k => k.high);
  const lows = ctx.klines.map(k => k.low);

  const atrArr = calcATR(highs, lows, closes, 14);
  const lastAtr = atrArr[atrArr.length - 1];
  const lastClose = closes[closes.length - 1];

  const atrPct = lastClose > 0 && Number.isFinite(lastAtr)
    ? (lastAtr / lastClose) * 100
    : 0;

  return {
    atr_pct: Math.round(atrPct * 100) / 100,
  };
}

// ─── Regime Detection ────────────────────────────────────────

function detectRegime(l1: L1Result, l10: L10Result, l14: L14Result, l15: L15Result): Regime {
  // 높은 변동성 + squeeze 해제 = BREAKOUT
  if (l15.atr_pct > 4 && !l14.bb_squeeze && Math.abs(l14.score) > 0) {
    return 'BREAKOUT';
  }
  // BB squeeze 중 = RANGE
  if (l14.bb_squeeze) {
    return 'RANGE';
  }
  // 높은 ATR + 명확한 방향 = VOLATILE
  if (l15.atr_pct > 3 && Math.abs(l10.score) < 10) {
    return 'VOLATILE';
  }
  // MTF 정렬 + 와이코프 MARKUP/MARKDOWN
  if (l1.phase === 'MARKUP' || (l10.mtf_confluence === 'BULL_ALIGNED' && l1.score > 10)) {
    return 'UPTREND';
  }
  if (l1.phase === 'MARKDOWN' || (l10.mtf_confluence === 'BEAR_ALIGNED' && l1.score < -10)) {
    return 'DOWNTREND';
  }
  // 기본
  if (l15.atr_pct > 3) return 'VOLATILE';
  return 'RANGE';
}

// ─── Funding Label ───────────────────────────────────────────

function fundingLabel(fr: number): string {
  if (fr > 0.001) return 'OVERHEAT_LONG';
  if (fr > 0.0005) return 'WARM_LONG';
  if (fr < -0.001) return 'OVERHEAT_SHORT';
  if (fr < -0.0005) return 'WARM_SHORT';
  return 'NEUTRAL';
}

// ─── HTF Structure Label ─────────────────────────────────────

function htfLabel(mtf: MtfConfluence): string {
  if (mtf === 'BULL_ALIGNED') return 'BULLISH';
  if (mtf === 'BEAR_ALIGNED') return 'BEARISH';
  return 'MIXED';
}

// ─── Public API ──────────────────────────────────────────────

/**
 * MarketContext → SignalSnapshot (15레이어 종합).
 * Scanner 15분 주기 / Terminal 실시간에서 호출.
 */
export function computeSignalSnapshot(
  ctx: MarketContext,
  symbol: string,
  timeframe: string,
): SignalSnapshot {
  // 15 레이어 계산
  const l1 = computeL1Wyckoff(ctx.klines);
  const l2 = computeL2(ctx);
  const l3 = computeL3VSurge(ctx.klines);
  const l4 = computeL4(ctx);
  const l5 = computeL5(ctx);
  const l6 = computeL6(ctx);
  const l7 = computeL7(ctx);
  const l8 = computeL8(ctx);
  const l9 = computeL9(ctx);
  const l10 = computeL10(ctx);
  const l11 = computeL11(ctx);
  const l12 = computeL12(ctx);
  const l13 = computeL13Breakout(ctx.klines);
  const l14 = computeL14BbSqueeze(ctx.klines);
  const l15 = computeL15(ctx);

  // Alpha Score
  const layers = { l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15 };
  const alphaScore = computeAlphaScore(layers);
  const alphaLbl = toAlphaLabel(alphaScore);

  // Regime
  const regime = detectRegime(l1, l10, l14, l15);

  // Composite score (0~1 정규화, Terminal 호환)
  const compositeScore = Math.round(((alphaScore + 100) / 200) * 100) / 100;

  const snapshot: SignalSnapshot = {
    // Layers
    l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15,

    // 종합
    alphaScore,
    alphaLabel: alphaLbl,
    regime,

    // Terminal 호환
    primaryZone: l1.phase,
    cvdState: l11.cvd_state,
    fundingLabel: fundingLabel(l2.fr),
    htfStructure: htfLabel(l10.mtf_confluence),
    compositeScore,

    // 메타
    symbol,
    timeframe,
    timestamp: Math.floor(Date.now() / 1000),
    hmac: '', // signSnapshot에서 채움
  };

  // HMAC은 서버에서 별도 호출 (node:crypto 필요)
  // snapshot.hmac은 ''로 반환, 서버 API에서 signSnapshot() 호출

  return snapshot;
}
