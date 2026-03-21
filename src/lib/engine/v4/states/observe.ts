// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: OBSERVE
// Collects raw market data and builds SignalSnapshot + StageFrame + MarketFrame
// Design: BattleStateMachine_20260322 § STATE 1
// ═══════════════════════════════════════════════════════════════

import { calcCVD, calcRSI, calcEMA } from '../../indicators.js';
import type { BinanceKline } from '../../types.js';
import type {
  BattleTickState,
  SignalSnapshot,
  MarketFrame,
  StageFrame,
  PredatorZone,
  OIRecord,
  FundingRecord,
  V4MarketRegime,
} from '../types.js';

// ─── Main entry ────────────────────────────────────────────────

export function observe(state: BattleTickState): BattleTickState {
  const { battleScenario, tick, stage } = state;
  const candles = battleScenario.candles;

  // Current tick candle + previous 24
  const endIdx = Math.min(tick + 25, candles.length);
  const startIdx = Math.max(0, endIdx - 25);
  const window = candles.slice(startIdx, endIdx);
  const currentCandle = window[window.length - 1];

  if (!currentCandle) {
    return {
      ...state,
      state: 'RETRIEVE',
      signal: buildPartialSignal(state.scenario.symbol),
      market: buildDefaultMarket(),
    };
  }

  const closes = window.map(c => c.close);
  const volumes = window.map(c => c.volume);
  const highs = window.map(c => c.high);
  const lows = window.map(c => c.low);

  // Build SignalSnapshot
  const signal = buildSignalSnapshot(
    closes,
    volumes,
    highs,
    lows,
    currentCandle,
    battleScenario.oiHistory,
    battleScenario.fundingHistory,
    state.scenario.symbol,
    tick,
  );

  // Build MarketFrame
  const market = buildMarketFrame(closes, currentCandle, volumes, signal);

  // Update StageFrame
  const updatedStage = updateStageFrame(stage, signal, market, tick);

  return {
    ...state,
    state: 'RETRIEVE',
    signal,
    market,
    stage: updatedStage,
  };
}

// ─── SignalSnapshot builder ────────────────────────────────────

function buildSignalSnapshot(
  closes: number[],
  volumes: number[],
  highs: number[],
  lows: number[],
  currentCandle: BinanceKline,
  oiHistory: OIRecord[],
  fundingHistory: FundingRecord[],
  symbol: string,
  tick: number,
): SignalSnapshot {
  const len = closes.length;

  // CVD
  const cvdArr = calcCVD(closes, volumes);
  const cvd1h = last(cvdArr) ?? 0;
  const cvdPrev = cvdArr[len - 2] ?? 0;
  const priceTrending = closes[len - 1] > closes[Math.max(0, len - 5)];
  const cvdDivergence = (priceTrending && cvd1h < cvdPrev) || (!priceTrending && cvd1h > cvdPrev);
  const cvdDivergenceType = cvdDivergence
    ? (cvd1h < cvdPrev ? 'bearish' : 'bullish')
    : undefined;

  // Funding
  const latestFunding = fundingHistory.length > 0
    ? fundingHistory[fundingHistory.length - 1].fundingRate
    : 0;
  const fundingLabel = latestFunding > 0.08
    ? 'OVERHEAT_LONG' as const
    : latestFunding < -0.08
      ? 'OVERHEAT_SHORT' as const
      : 'NEUTRAL' as const;

  // OI
  const oiRecent = oiHistory.slice(-2);
  const oiChange1h = oiRecent.length >= 2
    ? (oiRecent[1].openInterest - oiRecent[0].openInterest) / (oiRecent[0].openInterest || 1)
    : 0;
  const oiTrend: 'RISING' | 'FALLING' | 'FLAT' =
    oiChange1h > 0.02 ? 'RISING' : oiChange1h < -0.02 ? 'FALLING' : 'FLAT';

  // HTF Structure (simplified: EMA20 vs EMA50)
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes.length >= 50 ? closes : closes, Math.min(50, closes.length));
  const ema20Last = last(ema20) ?? currentCandle.close;
  const ema50Last = last(ema50) ?? currentCandle.close;
  const htfStructure: 'UPTREND' | 'DOWNTREND' | 'RANGE' =
    ema20Last > ema50Last * 1.005 ? 'UPTREND'
    : ema20Last < ema50Last * 0.995 ? 'DOWNTREND'
    : 'RANGE';

  // RSI
  const rsiArr = calcRSI(closes, 14);
  const rsi = last(rsiArr) ?? 50;

  // Primary Zone
  const primaryZone = classifyZone(rsi, htfStructure, oiTrend);

  // Modifiers
  const modifiers: string[] = [];
  const avgVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, volumes.length);
  if (currentCandle.volume > avgVol * 2.5) modifiers.push('VOLUME_SPIKE');
  if (Math.abs(oiChange1h) > 0.1) modifiers.push('OI_SHOCK');
  if (Math.abs(latestFunding) > 0.1) modifiers.push('EXTREME_FUNDING');

  return {
    symbol,
    timestamp: currentCandle.time,
    cvd1h,
    cvdDivergence,
    cvdDivergenceType,
    fundingRate: latestFunding,
    fundingLabel,
    oiChange1h,
    oiTrend,
    htfStructure,
    primaryZone,
    modifiers,
    dataQuality: closes.length >= 20 ? 'FULL' : 'PARTIAL',
  };
}

// ─── MarketFrame builder ───────────────────────────────────────

function buildMarketFrame(
  closes: number[],
  currentCandle: BinanceKline,
  volumes: number[],
  signal: SignalSnapshot,
): MarketFrame {
  const len = closes.length;
  const prevClose = len >= 2 ? closes[len - 2] : currentCandle.close;
  const priceDelta = prevClose > 0 ? (currentCandle.close - prevClose) / prevClose : 0;

  // ATR-based volatility
  // We need highs/lows for ATR but only have closes here
  // Use simplified volatility: std dev of returns
  const returns = closes.slice(-10).map((c, i, arr) =>
    i === 0 ? 0 : (c - arr[i - 1]) / (arr[i - 1] || 1)
  );
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const volatility = Math.sqrt(
    returns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / returns.length
  );

  // Volume impulse (current vs 10-bar avg)
  const avgVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, volumes.length);
  const volumeImpulse = avgVol > 0
    ? Math.min(1, currentCandle.volume / (avgVol * 3))
    : 0;

  // Regime
  const regime = classifyRegime(priceDelta, volatility, signal);

  return {
    price: currentCandle.close,
    priceDelta,
    regime,
    fundingBias: signal.fundingRate,
    volumeImpulse,
    volatility,
  };
}

// ─── StageFrame updater ────────────────────────────────────────

function updateStageFrame(
  prev: StageFrame,
  signal: SignalSnapshot,
  market: MarketFrame,
  tick: number,
): StageFrame {
  const verticalBias = computeVerticalBias(signal, market);

  // Predator zones: near liquidation clusters or extreme funding
  const predatorZones: PredatorZone[] = [];
  if (Math.abs(signal.fundingRate) > 0.1) {
    predatorZones.push({
      id: `predator-funding-${tick}`,
      priceLevel: market.price,
      type: 'liquidation_cluster',
      active: true,
    });
  }

  // Breakout gate: active when volume impulse high + OI rising
  const breakoutGateActive = market.volumeImpulse > 0.6 && signal.oiTrend === 'RISING';

  // Support integrity degrades on losses
  const supportIntegrity = Math.max(0, Math.min(1, prev.supportIntegrity));

  return {
    ...prev,
    verticalBias,
    predatorZones,
    breakoutGateActive,
    supportIntegrity,
    tick,
  };
}

// ─── Helpers ───────────────────────────────────────────────────

function last(arr: number[]): number | undefined {
  return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

function classifyZone(
  rsi: number,
  htf: 'UPTREND' | 'DOWNTREND' | 'RANGE',
  oiTrend: 'RISING' | 'FALLING' | 'FLAT',
): string {
  if (htf === 'DOWNTREND' && rsi < 30) return 'CAPITULATION';
  if (htf === 'DOWNTREND' && oiTrend === 'FALLING') return 'DISTRIBUTION';
  if (htf === 'UPTREND' && rsi > 70) return 'EUPHORIA';
  if (htf === 'UPTREND' && oiTrend === 'RISING') return 'ACCUMULATION';
  if (htf === 'RANGE') return 'CONSOLIDATION';
  return 'TRANSITION';
}

function classifyRegime(
  priceDelta: number,
  volatility: number,
  signal: SignalSnapshot,
): V4MarketRegime {
  if (volatility > 0.03) return 'extreme_vol';
  if (signal.htfStructure === 'UPTREND' && priceDelta > 0) return 'bull';
  if (signal.htfStructure === 'DOWNTREND' && priceDelta < 0) return 'bear';
  return 'sideways';
}

function computeVerticalBias(signal: SignalSnapshot, market: MarketFrame): number {
  let bias = 0;

  // CVD contribution
  if (signal.cvdDivergence) {
    bias += signal.cvdDivergenceType === 'bullish' ? 0.2 : -0.2;
  }
  bias += signal.cvd1h > 0 ? 0.1 : -0.1;

  // Funding contribution
  if (signal.fundingLabel === 'OVERHEAT_LONG') bias -= 0.15;
  if (signal.fundingLabel === 'OVERHEAT_SHORT') bias += 0.15;

  // OI contribution
  if (signal.oiTrend === 'RISING') bias += market.priceDelta > 0 ? 0.1 : -0.1;

  // Price momentum
  bias += market.priceDelta * 10; // scale up small deltas

  return Math.max(-1, Math.min(1, bias));
}

function buildPartialSignal(symbol: string): SignalSnapshot {
  return {
    symbol,
    timestamp: Date.now(),
    cvd1h: 0,
    cvdDivergence: false,
    fundingRate: 0,
    fundingLabel: 'NEUTRAL',
    oiChange1h: 0,
    oiTrend: 'FLAT',
    htfStructure: 'RANGE',
    primaryZone: 'CONSOLIDATION',
    modifiers: [],
    dataQuality: 'PARTIAL',
  };
}

function buildDefaultMarket(): MarketFrame {
  return {
    price: 0,
    priceDelta: 0,
    regime: 'sideways',
    fundingBias: 0,
    volumeImpulse: 0,
    volatility: 0,
  };
}
