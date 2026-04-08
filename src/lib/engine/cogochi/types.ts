// ═══════════════════════════════════════════════════════════════
// COGOCHI — 17-Layer Signal Types (L1~L15 + L18 + L19)
// ═══════════════════════════════════════════════════════════════
// Scanner + Terminal + Lab 공통 사용.

// ─── Enums ───────────────────────────────────────────────────

export type WyckoffPhase =
  | 'ACCUMULATION'
  | 'MARKUP'
  | 'DISTRIBUTION'
  | 'MARKDOWN'
  | 'REACCUM'
  | 'REDIST'
  | 'NONE';

export type CvdState =
  | 'BULLISH'
  | 'BEARISH'
  | 'BULLISH_DIVERGENCE'
  | 'BEARISH_DIVERGENCE'
  | 'ABSORPTION_BUY'
  | 'ABSORPTION_SELL'
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
  | 'STRONG_BULL'   // >= 60
  | 'BULL'          // >= 25
  | 'NEUTRAL'       // > -25
  | 'BEAR'          // > -60
  | 'STRONG_BEAR';  // <= -60

export type VolatilityState =
  | 'ULTRA_LOW'
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'EXTREME';

// ─── Layer Results ───────────────────────────────────────────

export interface L1Result {
  phase: WyckoffPhase;
  pattern: string;
  score: number;             // ±28
  hasSpring?: boolean;
  hasUtad?: boolean;
  hasSos?: boolean;
  hasSow?: boolean;
  ceTarget?: number;
}

export interface L2Result {
  fr: number;
  oi_change: number;
  ls_ratio: number;
  taker_ratio: number;
  price_change: number;
  score: number;             // ±55
  detail: string;
}

export interface L3Result {
  v_surge: boolean;
  surge_factor: number;
  direction: number;
  score: number;             // ±15
  label: string;
}

export interface L4Result {
  bid_ask_ratio: number;
  score: number;             // ±12
  label: string;
}

export interface L5Result {
  basis_pct: number;
  score: number;             // ±12
  label: string;
  liq_long_est?: number;
  liq_short_est?: number;
}

export interface L6Result {
  n_tx: number;
  avg_tx_value: number;
  mempool_pending: number;
  fastest_fee: number;
  score: number;             // ±10
  detail: string;
}

export interface L7Result {
  fear_greed: number;
  score: number;             // ±8
  label: string;
}

export interface L8Result {
  kimchi: number;
  score: number;             // ±10
  label: string;
}

export interface L9Result {
  liq_long_usd: number;
  liq_short_usd: number;
  score: number;             // ±12
  label: string;
}

export interface L10Result {
  mtf_confluence: MtfConfluence;
  acc_count: number;
  dist_count: number;
  score: number;             // ±20
  label: string;
}

export interface L11Result {
  cvd_state: CvdState;
  cvd_raw: number;
  price_change: number;
  absorption: boolean;
  score: number;             // ±12
}

export interface L12Result {
  sector_flow: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
  sector_score: number;
  score: number;             // ±10
}

export interface L13Result {
  breakout: boolean;
  pos_7d: number;
  pos_30d: number;
  score: number;             // ±12
  label: string;
}

export interface L14Result {
  bb_squeeze: boolean;
  bb_big_squeeze: boolean;
  bb_expanding: boolean;
  bb_width: number;
  bb_pos: number;
  score: number;             // ±10
  label: string;
}

export interface L15Result {
  atr_pct: number;
  vol_state: VolatilityState;
  stop_long: number;
  stop_short: number;
  tp1_long: number;
  tp2_long: number;
  rr_ratio: number;
  score: number;             // ±6
}

export interface L18Result {
  momentum_30m: number;
  vol_accel: number;
  score: number;             // ±25
  label: string;
}

export interface L19Result {
  oi_accel: number;
  signal: 'LONG_ENTRY' | 'SHORT_SQUEEZE' | 'LONG_PANIC' | 'SHORT_ENTRY' | 'NEUTRAL';
  score: number;             // ±15
  label: string;
}

// ─── Signal Snapshot ─────────────────────────────────────────

export interface SignalSnapshot {
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
  l18: L18Result;
  l19: L19Result;

  // 종합
  alphaScore: number;
  alphaLabel: AlphaLabel;
  verdict: string;
  regime: Regime;

  // Alerts
  extremeFR: boolean;
  frAlert: string;
  mtfTriple: boolean;
  bbBigSqueeze: boolean;

  // Terminal 호환
  primaryZone: WyckoffPhase;
  cvdState: CvdState;
  fundingLabel: string;
  htfStructure: string;
  compositeScore: number;

  // 시각화
  annotations?: ChartAnnotation[];
  tradePlan?: TradePlan;
  indicators?: IndicatorSeries;

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
  | 'l11' | 'l12' | 'l13' | 'l14' | 'l15'
  | 'l18' | 'l19';

export const ALL_LAYER_IDS: LayerId[] = [
  'l1', 'l2', 'l3', 'l4', 'l5',
  'l6', 'l7', 'l8', 'l9', 'l10',
  'l11', 'l12', 'l13', 'l14', 'l15',
  'l18', 'l19',
];

export const LAYER_MAX_CONTRIBUTION: Record<LayerId, number> = {
  l1:  28,
  l2:  55,
  l3:  15,
  l4:  12,
  l5:  12,
  l6:  10,
  l7:  8,
  l8:  10,
  l9:  12,
  l10: 20,
  l11: 12,
  l12: 10,
  l13: 12,
  l14: 10,
  l15: 6,
  l18: 25,
  l19: 15,
};

// ─── Chart Visualization Types ──────────────────────────────

export interface ChartAnnotation {
  type: 'support' | 'resistance' | 'fvg_bull' | 'fvg_bear' | 'ob_bull' | 'ob_bear' | 'bos' | 'choch';
  price: number;
  price2?: number;
  time: number;
  time2?: number;
  strength?: number;
  label?: string;
}

export interface TradePlan {
  direction: 'LONG' | 'SHORT' | 'NO_TRADE';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rrToTp2: number;
  slPct: number;
  confidence: number;
}

export interface IndicatorSeries {
  bbUpper?: number[];
  bbMiddle?: number[];
  bbLower?: number[];
  cvdRaw?: number[];
  ema20?: number[];
}

// ─── Extended Market Data (toolExecutor → layerEngine) ───────

export interface ExtendedMarketData {
  depth?: { bidVolume: number; askVolume: number; ratio: number };
  takerRatio?: number;
  oiChangePct?: number;
  priceChangePct?: number;
  forceOrders?: Array<{ side: 'BUY' | 'SELL'; price: number; qty: number; time: number }>;
  btcOnchain?: { nTx: number; avgTxValue: number };
  mempool?: { pending: number; fastestFee: number };
  kimchiPremium?: number;
  klines5m?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number; buyVolume?: number }>;
  klines1dExt?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  currentPrice?: number;
  sectorScore?: number;
  oiHistory5m?: Array<{ timestamp: number; oi: number }>;
}

// ─── Pattern Condition ───────────────────────────────────────

export interface PatternCondition {
  field: string;
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: string | number | boolean;
}
