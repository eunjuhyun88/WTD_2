// ═══════════════════════════════════════════════════════════════
// COGOCHI — 15-Layer Signal Types
// ═══════════════════════════════════════════════════════════════
// v5 설계 기준. Scanner + Terminal + Lab에서 공통 사용.

// ─── Enums ───────────────────────────────────────────────────

export type WyckoffPhase =
  | 'ACCUMULATION'
  | 'MARKUP'
  | 'DISTRIBUTION'
  | 'MARKDOWN'
  | 'REACCUM'
  | 'REDIST';

export type CvdState =
  | 'BULLISH'
  | 'BEARISH'
  | 'BULLISH_DIVERGENCE'
  | 'BEARISH_DIVERGENCE'
  | 'NEUTRAL';

export type MtfConfluence =
  | 'BULL_ALIGNED'
  | 'BEAR_ALIGNED'
  | 'MIXED';

export type Regime =
  | 'UPTREND'
  | 'DOWNTREND'
  | 'VOLATILE'
  | 'RANGE'
  | 'BREAKOUT';

export type AlphaLabel =
  | 'STRONG_BULL'   // +60 이상
  | 'BULL'          // +20 ~ +59
  | 'NEUTRAL'       // -19 ~ +19
  | 'BEAR'          // -20 ~ -59
  | 'STRONG_BEAR';  // -60 이하

// ─── Layer Results ───────────────────────────────────────────

export interface L1Result {
  phase: WyckoffPhase;
  score: number;  // ±30
}

export interface L2Result {
  fr: number;             // funding rate (raw)
  oi_change: number;      // OI 1h change ratio (-1~1)
  ls_ratio: number;       // long/short ratio
  score: number;          // ±20
}

export interface L3Result {
  v_surge: boolean;
  score: number;          // 0 or +15
}

export interface L4Result {
  bid_ask_ratio: number;  // 0~2
  score: number;          // ±10
}

export interface L5Result {
  basis_pct: number;      // spot-futures basis %
  score: number;          // ±10
}

export interface L6Result {
  exchange_netflow: number;  // BTC
  score: number;             // ±8
}

export interface L7Result {
  fear_greed: number;     // 0~100
  score: number;          // ±10
}

export interface L8Result {
  kimchi: number;         // premium %
  score: number;          // ±5
}

export interface L9Result {
  liq_1h: number;         // USD volume
  score: number;          // ±10
}

export interface L10Result {
  mtf_confluence: MtfConfluence;
  score: number;          // ±20
}

export interface L11Result {
  cvd_state: CvdState;
  cvd_raw: number;
  score: number;          // ±25
}

export interface L12Result {
  sector_flow: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
  score: number;          // ±5
}

export interface L13Result {
  breakout: boolean;
  score: number;          // ±15
}

export interface L14Result {
  bb_squeeze: boolean;
  bb_width: number;
  score: number;          // ±5
}

export interface L15Result {
  atr_pct: number;        // ATR as % of price
}

// ─── Signal Snapshot ─────────────────────────────────────────

export interface SignalSnapshot {
  // 15 레이어
  l1:  L1Result;
  l2:  L2Result;
  l3:  L3Result;
  l4:  L4Result;
  l5:  L5Result;
  l6:  L6Result;
  l7:  L7Result;
  l8:  L8Result;
  l9:  L9Result;
  l10: L10Result;
  l11: L11Result;
  l12: L12Result;
  l13: L13Result;
  l14: L14Result;
  l15: L15Result;

  // 종합
  alphaScore: number;     // -100 ~ +100
  alphaLabel: AlphaLabel;
  regime: Regime;

  // Terminal 호환 필드
  primaryZone: WyckoffPhase;
  cvdState: CvdState;
  fundingLabel: string;
  htfStructure: string;
  compositeScore: number; // 0~1 정규화

  // 메타
  symbol: string;
  timeframe: string;
  timestamp: number;
  hmac: string;
}

// ─── Layer ID ────────────────────────────────────────────────

export type LayerId =
  | 'l1' | 'l2' | 'l3' | 'l4' | 'l5'
  | 'l6' | 'l7' | 'l8' | 'l9' | 'l10'
  | 'l11' | 'l12' | 'l13' | 'l14' | 'l15';

export const ALL_LAYER_IDS: LayerId[] = [
  'l1', 'l2', 'l3', 'l4', 'l5',
  'l6', 'l7', 'l8', 'l9', 'l10',
  'l11', 'l12', 'l13', 'l14', 'l15',
];

// ─── Alpha Score weight map ──────────────────────────────────

/** 각 레이어의 Alpha Score 최대 기여값 */
export const LAYER_MAX_CONTRIBUTION: Record<LayerId, number> = {
  l1:  30,
  l2:  20,
  l3:  15,
  l4:  10,
  l5:  10,
  l6:  8,
  l7:  10,
  l8:  5,
  l9:  10,
  l10: 20,
  l11: 25,
  l12: 5,
  l13: 15,
  l14: 5,
  l15: 0,  // 보조 — Alpha에 직접 기여 안 함
};

// ─── Pattern Condition (Doctrine에서 사용) ────────────────────

export interface PatternCondition {
  field: string;    // "l11.cvd_state", "l2.fr", "l1.phase" 등
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: string | number | boolean;
}
