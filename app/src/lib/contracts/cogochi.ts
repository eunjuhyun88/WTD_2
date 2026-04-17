import type { MarketContext } from './marketContext';

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

export type Regime =
  | 'UPTREND'
  | 'DOWNTREND'
  | 'VOLATILE'
  | 'RANGE'
  | 'BREAKOUT';

export type AlphaLabel =
  | 'STRONG_BULL'
  | 'BULL'
  | 'NEUTRAL'
  | 'BEAR'
  | 'STRONG_BEAR';

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

export interface SignalSnapshotL1 {
  phase: WyckoffPhase;
  pattern: string;
  score: number;
}

export interface SignalSnapshotL2 {
  fr: number;
  score: number;
  detail: string;
}

export interface SignalSnapshotLabelLayer {
  score: number;
  label: string;
}

export interface SignalSnapshotL6 {
  score: number;
  detail: string;
}

export interface SignalSnapshotL11 {
  score: number;
  cvd_state: string;
}

export interface SignalSnapshotL14 {
  score: number;
  label: string;
  bb_squeeze: boolean;
  bb_big_squeeze: boolean;
}

export interface SignalSnapshot {
  l1: SignalSnapshotL1;
  l2: SignalSnapshotL2;
  l3: SignalSnapshotLabelLayer;
  l4: SignalSnapshotLabelLayer;
  l5: SignalSnapshotLabelLayer;
  l6: SignalSnapshotL6;
  l7: SignalSnapshotLabelLayer;
  l8: SignalSnapshotLabelLayer;
  l9: SignalSnapshotLabelLayer;
  l10: SignalSnapshotLabelLayer;
  l11: SignalSnapshotL11;
  l12: unknown;
  l13: SignalSnapshotLabelLayer;
  l14: SignalSnapshotL14;
  l15: unknown;
  l18: SignalSnapshotLabelLayer;
  l19: SignalSnapshotLabelLayer;
  alphaScore: number;
  alphaLabel: AlphaLabel;
  verdict: string;
  regime: Regime;
  extremeFR: boolean;
  frAlert: string;
  mtfTriple: boolean;
  bbBigSqueeze: boolean;
  primaryZone: WyckoffPhase;
  cvdState: CvdState;
  fundingLabel: string;
  htfStructure: string;
  compositeScore: number;
  annotations?: ChartAnnotation[];
  tradePlan?: TradePlan;
  indicators?: IndicatorSeries;
  symbol: string;
  timeframe: string;
  timestamp: number;
  hmac: string;
}

export type ServerMarketContext = MarketContext;

export type DouniArchetype = 'CRUSHER' | 'RIDER' | 'ORACLE' | 'GUARDIAN';
export type DouniStage = 'EGG' | 'CHICK' | 'FLEDGLING' | 'DOUNI' | 'ELDER';

export interface DouniProfile {
  name: string;
  archetype: DouniArchetype;
  stage: DouniStage;
}

export interface BuildDouniPromptOptions {
  locale?: string;
  intent?: string;
  state?: unknown;
  memory?: string;
  sessionSummary?: string;
}
