// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — RAG Embedding: Deterministic 256d Vector Builder
// ═══════════════════════════════════════════════════════════════
//
// 48개 팩터 + 메타데이터로부터 256차원 벡터를 결정론적으로 생성.
// 외부 API 비용 $0 — 동일 입력 → 동일 출력 보장.
//
// Layout:
//   [0-47]    raw factor values / 100
//   [48-95]   |factor| / 100 (magnitude)
//   [96-143]  role-weighted factors
//   [144-147] regime one-hot
//   [148-152] timeframe one-hot
//   [153-162] top-10 factor signature
//   [163-170] pattern binary flags
//   [171-186] pairwise factor interactions (top 8 pairs)
//   [187-254] cross-factor correlation buckets (68 dims)
//   [255]     data completeness

import type { FactorResult, MarketRegime } from './types';

// ─── 48 팩터 정규 순서 (OFFENSE → DEFENSE → CONTEXT) ─────────

export const CANONICAL_FACTOR_ORDER: string[] = [
  // STRUCTURE (OFFENSE)
  'EMA_TREND', 'RSI_TREND', 'RSI_DIVERGENCE', 'MTF_ALIGNMENT', 'PRICE_STRUCTURE', 'VOL_TREND',
  // VPA (OFFENSE)
  'CVD_TREND', 'BUY_SELL_RATIO', 'VOL_PROFILE', 'ABSORPTION', 'VOL_DIVERGENCE', 'CLIMAX_SIGNAL',
  // ICT (OFFENSE)
  'LIQUIDITY_POOL', 'FVG', 'ORDER_BLOCK', 'BOS_CHOCH', 'DISPLACEMENT', 'PREMIUM_DISCOUNT',
  // DERIV (DEFENSE)
  'OI_PRICE_CONV', 'FR_TREND', 'LIQUIDATION_TREND', 'LS_RATIO_TREND', 'OI_DIVERGENCE', 'SQUEEZE_SIGNAL',
  // VALUATION (DEFENSE)
  'MVRV_ZONE', 'NUPL_TREND', 'SOPR_SIGNAL', 'CYCLE_POSITION', 'REALIZED_CAP_TREND', 'SUPPLY_PROFIT',
  // FLOW (DEFENSE)
  'EXCHANGE_FLOW', 'WHALE_ACTIVITY', 'MINER_FLOW', 'STABLECOIN_FLOW', 'ACTIVE_ADDRESSES', 'ETF_FLOW',
  // SENTI (CONTEXT)
  'FG_TREND', 'SOCIAL_VOLUME', 'SOCIAL_SENTIMENT', 'NEWS_IMPACT', 'SEARCH_TREND', 'CONTRARIAN_SIGNAL',
  // MACRO (CONTEXT)
  'DXY_TREND', 'EQUITY_TREND', 'YIELD_TREND', 'BTC_DOMINANCE', 'STABLECOIN_MCAP', 'EVENT_PROXIMITY',
];

// Agent role weights: OFFENSE drives direction, DEFENSE validates, CONTEXT informs
const ROLE_WEIGHT: Record<string, number> = {};
// OFFENSE: indices 0-17 (STRUCTURE, VPA, ICT)
for (let i = 0; i < 18; i++) ROLE_WEIGHT[CANONICAL_FACTOR_ORDER[i]] = 1.2;
// DEFENSE: indices 18-35 (DERIV, VALUATION, FLOW)
for (let i = 18; i < 36; i++) ROLE_WEIGHT[CANONICAL_FACTOR_ORDER[i]] = 1.0;
// CONTEXT: indices 36-47 (SENTI, MACRO)
for (let i = 36; i < 48; i++) ROLE_WEIGHT[CANONICAL_FACTOR_ORDER[i]] = 0.8;

// Regime encoding
const REGIME_MAP: Record<string, number[]> = {
  'bullish':     [1, 0, 0, 0],
  'trending_up': [1, 0, 0, 0],
  'bearish':     [0, 1, 0, 0],
  'trending_down': [0, 1, 0, 0],
  'ranging':     [0, 0, 1, 0],
  'sideways':    [0, 0, 1, 0],
  'volatile':    [0, 0, 0, 1],
};

// Timeframe encoding
const TF_MAP: Record<string, number[]> = {
  '15m': [0.5, 0, 0, 0, 0],
  '1h':  [1, 0, 0, 0, 0],
  '4h':  [0, 1, 0, 0, 0],
  '1d':  [0, 0, 1, 0, 0],
  '1w':  [0, 0, 0, 1, 0],
};

// Known pattern flags
const KNOWN_PATTERNS = [
  'TREND_CONTINUATION', 'RSI_DIVERGENCE', 'VOLUME_DIVERGENCE', 'STRUCTURE_BREAK',
  'MIXED_SIGNALS', 'BREAKOUT', 'FALSE_BREAKOUT', 'MOMENTUM_SHIFT',
];

// Top 8 pairwise factor interactions (most informative combinations)
const INTERACTION_PAIRS: [string, string][] = [
  ['EMA_TREND', 'CVD_TREND'],           // Trend + Volume confirmation
  ['RSI_DIVERGENCE', 'VOL_DIVERGENCE'],  // Double divergence
  ['FR_TREND', 'OI_PRICE_CONV'],         // Derivatives alignment
  ['FG_TREND', 'SOCIAL_SENTIMENT'],      // Sentiment convergence
  ['LIQUIDITY_POOL', 'DISPLACEMENT'],    // ICT setup
  ['BOS_CHOCH', 'PRICE_STRUCTURE'],      // Structure break confirmation
  ['MVRV_ZONE', 'NUPL_TREND'],           // On-chain valuation
  ['EXCHANGE_FLOW', 'WHALE_ACTIVITY'],   // Flow convergence
];

// 8 agent groups for cross-correlation (6 factors each)
const AGENT_GROUPS = [
  [0, 1, 2, 3, 4, 5],       // STRUCTURE
  [6, 7, 8, 9, 10, 11],     // VPA
  [12, 13, 14, 15, 16, 17], // ICT
  [18, 19, 20, 21, 22, 23], // DERIV
  [24, 25, 26, 27, 28, 29], // VALUATION
  [30, 31, 32, 33, 34, 35], // FLOW
  [36, 37, 38, 39, 40, 41], // SENTI
  [42, 43, 44, 45, 46, 47], // MACRO
];

/**
 * Build a 256-dimensional embedding from game context.
 * Deterministic: same inputs always produce same output.
 * No external API — cost $0.
 */
export function computeEmbedding(
  factors: FactorResult[],
  regime: MarketRegime | string,
  timeframe: string,
  detectedPatterns: string[],
  dataCompleteness: number
): number[] {
  const emb = new Array(256).fill(0);

  // Build factor lookup map
  const factorMap = new Map<string, number>();
  for (const f of factors) {
    factorMap.set(f.factorId, f.value);
  }

  // ─── Dims [0-47]: Raw factor values / 100 ─────────────────
  for (let i = 0; i < 48; i++) {
    const val = factorMap.get(CANONICAL_FACTOR_ORDER[i]) ?? 0;
    emb[i] = clamp(val / 100, -1, 1);
  }

  // ─── Dims [48-95]: Absolute magnitude ─────────────────────
  for (let i = 0; i < 48; i++) {
    emb[48 + i] = Math.abs(emb[i]);
  }

  // ─── Dims [96-143]: Role-weighted ─────────────────────────
  for (let i = 0; i < 48; i++) {
    const weight = ROLE_WEIGHT[CANONICAL_FACTOR_ORDER[i]] ?? 1.0;
    emb[96 + i] = clamp(emb[i] * weight, -1.2, 1.2);
  }

  // ─── Dims [144-147]: Regime one-hot ───────────────────────
  const regimeVec = REGIME_MAP[regime] ?? [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) emb[144 + i] = regimeVec[i];

  // ─── Dims [148-152]: Timeframe one-hot ────────────────────
  const tfVec = TF_MAP[timeframe] ?? [0, 0, 0, 0, 1]; // 'other' as default
  for (let i = 0; i < 5; i++) emb[148 + i] = tfVec[i];

  // ─── Dims [153-162]: Top-10 factor signature ──────────────
  const sorted = [...factors]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 10);
  for (let i = 0; i < 10; i++) {
    emb[153 + i] = sorted[i] ? clamp(sorted[i].value / 100, -1, 1) : 0;
  }

  // ─── Dims [163-170]: Pattern binary flags ─────────────────
  const patternSet = new Set(detectedPatterns.map(p => p.toUpperCase()));
  for (let i = 0; i < KNOWN_PATTERNS.length; i++) {
    emb[163 + i] = patternSet.has(KNOWN_PATTERNS[i]) ? 1.0 : 0.0;
  }

  // ─── Dims [171-186]: Pairwise factor interactions ─────────
  for (let i = 0; i < INTERACTION_PAIRS.length; i++) {
    const [a, b] = INTERACTION_PAIRS[i];
    const va = factorMap.get(a) ?? 0;
    const vb = factorMap.get(b) ?? 0;
    emb[171 + i] = clamp((va * vb) / 10000, -1, 1);
  }
  // Pad remaining dims 179-186 with secondary interactions
  const secondaryPairs: [string, string][] = [
    ['MTF_ALIGNMENT', 'EQUITY_TREND'],
    ['SQUEEZE_SIGNAL', 'LIQUIDATION_TREND'],
    ['DXY_TREND', 'BTC_DOMINANCE'],
    ['STABLECOIN_FLOW', 'STABLECOIN_MCAP'],
    ['ACTIVE_ADDRESSES', 'SOCIAL_VOLUME'],
    ['NEWS_IMPACT', 'EVENT_PROXIMITY'],
    ['CYCLE_POSITION', 'SUPPLY_PROFIT'],
    ['ETF_FLOW', 'MINER_FLOW'],
  ];
  for (let i = 0; i < secondaryPairs.length; i++) {
    const [a, b] = secondaryPairs[i];
    const va = factorMap.get(a) ?? 0;
    const vb = factorMap.get(b) ?? 0;
    emb[179 + i] = clamp((va * vb) / 10000, -1, 1);
  }

  // ─── Dims [187-254]: Cross-factor correlation buckets ─────
  // 28 inter-group average products + 8 within-group variances + 32 quantile encodings
  let dimIdx = 187;

  // Inter-group average products (C(8,2) = 28)
  for (let g1 = 0; g1 < 8; g1++) {
    for (let g2 = g1 + 1; g2 < 8; g2++) {
      let sum = 0;
      let count = 0;
      for (const i1 of AGENT_GROUPS[g1]) {
        for (const i2 of AGENT_GROUPS[g2]) {
          sum += emb[i1] * emb[i2];
          count++;
        }
      }
      emb[dimIdx++] = clamp(sum / Math.max(count, 1), -1, 1);
    }
  }
  // dimIdx should be 187 + 28 = 215

  // Within-group variance (8 groups)
  for (let g = 0; g < 8; g++) {
    const vals = AGENT_GROUPS[g].map(i => emb[i]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    emb[dimIdx++] = clamp(variance, 0, 1);
  }
  // dimIdx should be 215 + 8 = 223

  // Quantile encoding: bucket each factor into 4 quantiles (32 dims for first 32 factors)
  for (let i = 0; i < 32 && dimIdx < 255; i++) {
    const v = emb[i]; // normalized factor value [-1, 1]
    emb[dimIdx++] = v <= -0.5 ? 1 : 0; // strongly negative
  }

  // ─── Dim [255]: Data completeness ─────────────────────────
  emb[255] = clamp(dataCompleteness, 0, 1);

  return emb;
}

// ─── Terminal Scan Embedding ───────────────────────────────

/** Terminal 스캔의 8에이전트 신호 */
interface ScanSignal {
  agentId: string;
  vote: string;       // 'long' | 'short' | 'neutral'
  confidence: number;  // 0-100
}

/**
 * Terminal 스캔 결과로부터 256d 임베딩을 생성.
 * 8에이전트 신호를 48팩터 공간에 매핑하여
 * Arena War 임베딩과 같은 벡터 공간을 공유.
 *
 * 동일 입력 → 동일 출력. 비용 $0.
 */
export function computeTerminalScanEmbedding(
  signals: ScanSignal[],
  timeframe: string,
  dataCompleteness: number = 0.7
): number[] {
  const emb = new Array(256).fill(0);

  // Agent ID → CANONICAL index range 매핑
  const AGENT_TO_FACTOR_RANGE: Record<string, [number, number]> = {
    'STRUCTURE': [0, 5],     // factors 0-5
    'VPA':       [6, 11],    // factors 6-11
    'ICT':       [12, 17],   // factors 12-17
    'DERIV':     [18, 23],   // factors 18-23
    'VALUATION': [24, 29],   // factors 24-29
    'FLOW':      [30, 35],   // factors 30-35
    'SENTI':     [36, 41],   // factors 36-41
    'MACRO':     [42, 47],   // factors 42-47
  };

  // Build signal lookup
  const signalMap = new Map<string, ScanSignal>();
  for (const s of signals) {
    signalMap.set(s.agentId.toUpperCase(), s);
  }

  // ─── Dims [0-47]: 각 에이전트의 방향 × 신뢰도를 6개 팩터 슬롯에 분배
  for (const [agentId, [start, end]] of Object.entries(AGENT_TO_FACTOR_RANGE)) {
    const signal = signalMap.get(agentId);
    if (!signal) continue;

    const dirValue = signal.vote === 'long' ? 1 :
                     signal.vote === 'short' ? -1 : 0;
    const confNorm = signal.confidence / 100;

    // 6개 슬롯에 gradient로 분배 (중앙에 강하게, 가장자리에 약하게)
    for (let i = start; i <= end; i++) {
      const slot = i - start;
      const gradient = 1 - (Math.abs(slot - 2.5) / 3); // center-heavy
      emb[i] = clamp(dirValue * confNorm * gradient, -1, 1);
    }
  }

  // ─── Dims [48-95]: Absolute magnitude
  for (let i = 0; i < 48; i++) {
    emb[48 + i] = Math.abs(emb[i]);
  }

  // ─── Dims [96-143]: Role-weighted
  for (let i = 0; i < 48; i++) {
    const weight = ROLE_WEIGHT[CANONICAL_FACTOR_ORDER[i]] ?? 1.0;
    emb[96 + i] = clamp(emb[i] * weight, -1.2, 1.2);
  }

  // ─── Dims [144-147]: Regime one-hot (estimate from signals)
  const longSignals = signals.filter(s => s.vote === 'long').length;
  const shortSignals = signals.filter(s => s.vote === 'short').length;
  const avgConf = signals.length > 0
    ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length
    : 50;

  let regimeStr = 'ranging';
  if (longSignals >= 5 && avgConf >= 65) regimeStr = 'bullish';
  else if (shortSignals >= 5 && avgConf >= 65) regimeStr = 'bearish';
  else if (Math.max(...signals.map(s => s.confidence)) - Math.min(...signals.map(s => s.confidence)) > 40) {
    regimeStr = 'volatile';
  }
  const regimeVec = REGIME_MAP[regimeStr] ?? [0, 0, 1, 0];
  for (let i = 0; i < 4; i++) emb[144 + i] = regimeVec[i];

  // ─── Dims [148-152]: Timeframe one-hot
  const tfVec = TF_MAP[timeframe] ?? [0, 0, 0, 0, 1];
  for (let i = 0; i < 5; i++) emb[148 + i] = tfVec[i];

  // ─── Dims [153-162]: Top-10 agent confidence signature
  const sortedSignals = [...signals]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
  for (let i = 0; i < 10; i++) {
    if (sortedSignals[i]) {
      const s = sortedSignals[i];
      const dirVal = s.vote === 'long' ? 1 : s.vote === 'short' ? -1 : 0;
      emb[153 + i] = clamp(dirVal * s.confidence / 100, -1, 1);
    }
  }

  // ─── Dims [163-170]: Pattern flags (terminal scans: consensus patterns)
  emb[163] = longSignals >= 6 ? 1 : 0;    // TREND_CONTINUATION (strong long consensus)
  emb[164] = 0; // RSI_DIVERGENCE (need factor data)
  emb[165] = 0; // VOLUME_DIVERGENCE
  emb[166] = shortSignals >= 5 && longSignals >= 3 ? 1 : 0; // STRUCTURE_BREAK
  emb[167] = Math.abs(longSignals - shortSignals) <= 1 ? 1 : 0; // MIXED_SIGNALS
  emb[168] = avgConf >= 75 ? 1 : 0; // BREAKOUT (high confidence consensus)
  emb[169] = 0; // FALSE_BREAKOUT
  emb[170] = 0; // MOMENTUM_SHIFT

  // ─── Dims [171-186]: Pairwise interactions (from signal confidences)
  // Use agent pair interaction products
  const agentPairs: [string, string][] = [
    ['STRUCTURE', 'VPA'],     ['STRUCTURE', 'DERIV'],
    ['VPA', 'FLOW'],          ['SENTI', 'MACRO'],
    ['ICT', 'STRUCTURE'],     ['DERIV', 'FLOW'],
    ['VALUATION', 'MACRO'],   ['FLOW', 'SENTI'],
  ];
  for (let i = 0; i < agentPairs.length; i++) {
    const [a, b] = agentPairs[i];
    const sa = signalMap.get(a);
    const sb = signalMap.get(b);
    if (sa && sb) {
      const da = sa.vote === 'long' ? 1 : sa.vote === 'short' ? -1 : 0;
      const db = sb.vote === 'long' ? 1 : sb.vote === 'short' ? -1 : 0;
      emb[171 + i] = clamp((da * sa.confidence * db * sb.confidence) / 10000, -1, 1);
    }
  }

  // ─── Dims [187-254]: Cross-factor correlation (fill from inter-group products)
  let dimIdx = 187;
  for (let g1 = 0; g1 < 8; g1++) {
    for (let g2 = g1 + 1; g2 < 8; g2++) {
      let sum = 0;
      let count = 0;
      for (const i1 of AGENT_GROUPS[g1]) {
        for (const i2 of AGENT_GROUPS[g2]) {
          sum += emb[i1] * emb[i2];
          count++;
        }
      }
      emb[dimIdx++] = clamp(sum / Math.max(count, 1), -1, 1);
      if (dimIdx >= 255) break;
    }
    if (dimIdx >= 255) break;
  }

  // Fill remaining with within-group variance
  for (let g = 0; g < 8 && dimIdx < 255; g++) {
    const vals = AGENT_GROUPS[g].map(i => emb[i]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    emb[dimIdx++] = clamp(variance, 0, 1);
  }

  // ─── Dim [255]: Data completeness
  emb[255] = clamp(dataCompleteness, 0, 1);

  return emb;
}

// ═══════════════════════════════════════════════════════════════
// QuickTrade Embedding — 트레이드 결정을 256d 벡터로 (벡터 공간 호환)
// ═══════════════════════════════════════════════════════════════

export function computeQuickTradeEmbedding(params: {
  pair: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  tp: number | null;
  sl: number | null;
  source: string;
  confidence?: number;
  timeframe?: string;
}): number[] {
  const emb = new Array(256).fill(0);
  const { direction, entryPrice, currentPrice, tp, sl, confidence = 50, timeframe = '4h' } = params;
  const dirSign = direction === 'LONG' ? 1 : -1;
  const confNorm = clamp(confidence, 0, 100) / 100;

  // Dims [0-47]: Direction signal across agent slots
  // OFFENSE agents (0-17): strong signal in direction
  for (let i = 0; i < 18; i++) {
    const gradient = 1.0 - (i / 18) * 0.4; // center-heavy: 1.0→0.6
    emb[i] = dirSign * confNorm * gradient * 0.6;
  }
  // DEFENSE agents (18-35): mild directional signal
  for (let i = 18; i < 36; i++) {
    emb[i] = dirSign * confNorm * 0.2;
  }
  // CONTEXT agents (36-47): entry/current price momentum
  const momentum = entryPrice > 0
    ? clamp((currentPrice - entryPrice) / entryPrice, -0.1, 0.1) * 10
    : 0;
  for (let i = 36; i < 48; i++) {
    emb[i] = momentum * 0.3;
  }

  // Dims [48-95]: Magnitude
  for (let i = 0; i < 48; i++) {
    emb[48 + i] = Math.abs(emb[i]);
  }

  // Dims [96-143]: Role-weighted (OFFENSE×1.2, DEFENSE×1.0, CONTEXT×0.8)
  for (let i = 0; i < 18; i++) emb[96 + i] = clamp(emb[i] * 1.2, -1.2, 1.2);
  for (let i = 18; i < 36; i++) emb[96 + i] = emb[i];
  for (let i = 36; i < 48; i++) emb[96 + i] = clamp(emb[i] * 0.8, -1, 1);

  // Dims [144-147]: Regime one-hot (infer from momentum)
  if (momentum > 0.3) emb[144] = 1;       // trending_up
  else if (momentum < -0.3) emb[145] = 1;  // trending_down
  else emb[146] = 1;                        // ranging

  // Dims [148-152]: Timeframe one-hot
  const tfIdx = TF_MAP[timeframe];
  if (tfIdx) {
    for (let i = 0; i < tfIdx.length && i < 5; i++) {
      emb[148 + i] = tfIdx[i];
    }
  } else {
    emb[152] = 1; // other
  }

  // Dims [153-162]: TP/SL risk-reward ratio signal
  if (tp && sl && entryPrice > 0) {
    const tpDist = Math.abs(tp - entryPrice) / entryPrice;
    const slDist = Math.abs(sl - entryPrice) / entryPrice;
    const rrRatio = slDist > 0 ? clamp(tpDist / slDist, 0, 5) / 5 : 0.5;
    emb[153] = rrRatio;
    emb[154] = clamp(tpDist * 10, 0, 1);
    emb[155] = clamp(slDist * 10, 0, 1);
  }
  emb[156] = confNorm;

  // Dims [163-170]: Pattern flags
  if (confidence >= 75) emb[163] = 1;  // TREND_CONTINUATION hint
  if (tp && entryPrice > 0) {
    const tpDir = direction === 'LONG' ? tp > entryPrice : tp < entryPrice;
    if (tpDir) emb[165] = 1; // BREAKOUT hint
  }

  // Dims [171-254]: sparse (no factor interaction data for trades)
  // Dim [255]: Data completeness = 0.3 (sparse compared to full 48-factor)
  emb[255] = 0.3;

  return emb;
}

// ═══════════════════════════════════════════════════════════════
// Signal Action Embedding — 시그널 행동을 256d 벡터로
// ═══════════════════════════════════════════════════════════════

const ACTION_INTENSITY: Record<string, number> = {
  convert_to_trade: 1.0,
  copy_trade: 0.8,
  quick_long: 0.9,
  quick_short: 0.9,
  track: 0.5,
  untrack: 0.2,
};

export function computeSignalActionEmbedding(params: {
  pair: string;
  direction: string;
  actionType: string;
  confidence: number | null;
  source: string;
  timeframe?: string;
}): number[] {
  const emb = new Array(256).fill(0);
  const { direction, actionType, confidence, timeframe = '4h' } = params;
  const dirSign = direction === 'LONG' ? 1 : direction === 'SHORT' ? -1 : 0;
  const confNorm = clamp(confidence ?? 50, 0, 100) / 100;
  const intensity = ACTION_INTENSITY[actionType] ?? 0.5;

  // Dims [0-47]: Weak directional signal modulated by action intensity
  for (let i = 0; i < 18; i++) {
    emb[i] = dirSign * confNorm * intensity * 0.4;
  }
  for (let i = 18; i < 36; i++) {
    emb[i] = dirSign * confNorm * intensity * 0.15;
  }

  // Dims [48-95]: Magnitude
  for (let i = 0; i < 48; i++) {
    emb[48 + i] = Math.abs(emb[i]);
  }

  // Dims [96-143]: Role-weighted
  for (let i = 0; i < 18; i++) emb[96 + i] = clamp(emb[i] * 1.2, -1.2, 1.2);
  for (let i = 18; i < 36; i++) emb[96 + i] = emb[i];
  for (let i = 36; i < 48; i++) emb[96 + i] = clamp(emb[i] * 0.8, -1, 1);

  // Dims [144-147]: Regime defaults to ranging for signal actions
  emb[146] = 1;

  // Dims [148-152]: Timeframe
  const tfIdx = TF_MAP[timeframe];
  if (tfIdx) {
    for (let i = 0; i < tfIdx.length && i < 5; i++) {
      emb[148 + i] = tfIdx[i];
    }
  }

  // Dim [156]: Confidence
  emb[156] = confNorm * intensity;

  // Dim [255]: Data completeness = 0.2 (very sparse)
  emb[255] = 0.2;

  return emb;
}

// ═══════════════════════════════════════════════════════════════
// Semantic Dedup Hash — Paper 1: 같은 시간창 내 동일 구조 중복 방지
// ═══════════════════════════════════════════════════════════════

export function computeDedupeHash(params: {
  pair: string;
  timeframe: string;
  direction: string;
  regime: string;
  source: string;
  windowMinutes?: number;
}): string {
  const { pair, timeframe, direction, regime, source, windowMinutes = 60 } = params;
  const timeBucket = Math.floor(Date.now() / (windowMinutes * 60 * 1000));
  const parts = [pair, timeframe, direction, regime, source, String(timeBucket)];
  // Simple hash: join + basic numeric hash
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `dh_${Math.abs(hash).toString(36)}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
