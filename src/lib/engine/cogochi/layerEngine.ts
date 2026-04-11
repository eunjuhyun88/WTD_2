// ═════════════════���═════════════════════════════════════════════
// COGOCHI — 17-Layer Engine (L1~L15 + L18 + L19)
// ════════════════════════════════════════════════���══════════════
// Direct computation from raw market data.
// Each layer uses the exact scoring formula.

import type { MarketContext } from '../factorEngine';
import type { BinanceKline } from '../types';
import { calcEMA, calcBollingerBands } from '../indicators';

import type {
  SignalSnapshot, IndicatorSeries, ExtendedMarketData,
  L2Result, L4Result, L5Result,
  L6Result, L7Result, L8Result, L9Result, L10Result,
  L11Result, L12Result, L15Result,
  CvdState, MtfConfluence, Regime, VolatilityState,
} from './types';

import { computeL1Wyckoff } from './layers/l1Wyckoff';
import { computeL3VSurge } from './layers/l3VSurge';
import { computeL13Breakout } from './layers/l13Breakout';
import { computeL14BbSqueeze } from './layers/l14BbSqueeze';
import { computeL18Momentum } from './layers/l18Momentum';
import { computeL19OIAccel } from './layers/l19OIAccel';
import { computeAlphaScore, toAlphaLabel, buildVerdict } from './alphaScore';

// E3a — L2 flow event emission uses typed EventId / EventPayload from
// the contracts registry. Importing via `$lib/contracts` barrel path
// so the svelte-kit resolver resolves it the same way as every other
// contract consumer.
import { EventId, type EventPayload } from '$lib/contracts/events';
import { EventDirection, EventSeverity } from '$lib/contracts/ids';

// Pinned L2 flow thresholds — dissection §4.2. Lifted to named
// constants here so the E6 slice can move them into a central
// thresholds registry without touching the layer body.
const L2_FR_EXTREME_NEG = -0.07;
const L2_FR_EXTREME_POS = 0.08;
const L2_OI_BUILD_MIN_PCT = 3;
const L2_PRICE_BUILD_MIN_PCT = 0.5;

// ─── Helpers ───��─────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── L2: Flow (FR + OI + L/S + Taker) ±55 ───────────────────

function computeL2(ctx: MarketContext, ext: ExtendedMarketData): L2Result {
  const fr = ctx.derivatives?.funding ?? 0;
  const oiPct = ext.oiChangePct ?? 0;
  const lsRatio = ctx.derivatives?.lsRatio ?? 1.0;
  const takerRatio = ext.takerRatio ?? 1.0;
  const pricePct = ext.priceChangePct ?? 0;

  let score = 0;
  const details: string[] = [];
  const events: EventPayload[] = [];

  // FR scoring
  if (fr < -0.07) {
    score += 24;
    details.push('FR극단음수');
    // E3a — typed event for downstream verdictBuilder consumption.
    events.push({
      id: EventId.FLOW_FR_EXTREME_NEGATIVE,
      direction: EventDirection.BULL,
      severity: EventSeverity.HIGH,
      note: 'Short-squeeze risk: funding rate extreme negative',
      data: { funding_rate: fr, threshold: L2_FR_EXTREME_NEG }
    });
  }
  else if (fr < -0.025) { score += 15; details.push('FR음수'); }
  else if (fr < -0.005) { score += 6; details.push('FR약한음수'); }
  else if (fr < 0.005) { /* neutral */ }
  else if (fr < 0.04) { score -= 10; details.push('FR양수'); }
  else if (fr < 0.08) { score -= 18; details.push('FR높음'); }
  else {
    score -= 24;
    details.push('FR극단양수');
    events.push({
      id: EventId.FLOW_FR_EXTREME_POSITIVE,
      direction: EventDirection.BEAR,
      severity: EventSeverity.HIGH,
      note: 'Long-liquidation risk: funding rate extreme positive',
      data: { funding_rate: fr, threshold: L2_FR_EXTREME_POS }
    });
  }

  // OI + Price synergy
  if (oiPct > L2_OI_BUILD_MIN_PCT && pricePct > L2_PRICE_BUILD_MIN_PCT) {
    score += 15;
    details.push('OI↑+P↑');
    events.push({
      id: EventId.FLOW_LONG_ENTRY_BUILD,
      direction: EventDirection.BULL,
      severity: EventSeverity.MEDIUM,
      note: 'New longs opening: OI and price rising together',
      data: { oi_change_pct: oiPct, price_change_pct: pricePct }
    });
  }
  else if (oiPct > L2_OI_BUILD_MIN_PCT && pricePct < -L2_PRICE_BUILD_MIN_PCT) {
    score -= 15;
    details.push('OI↑+P↓');
    events.push({
      id: EventId.FLOW_SHORT_ENTRY_BUILD,
      direction: EventDirection.BEAR,
      severity: EventSeverity.MEDIUM,
      note: 'New shorts opening: OI rising while price falls',
      data: { oi_change_pct: oiPct, price_change_pct: pricePct }
    });
  }
  else if (oiPct < -L2_OI_BUILD_MIN_PCT && pricePct < -L2_PRICE_BUILD_MIN_PCT) {
    score += 8;
    details.push('OI↓+P↓ recovery');
    events.push({
      id: EventId.FLOW_LONG_CASCADE_ACTIVE,
      direction: EventDirection.BEAR,
      severity: EventSeverity.HIGH,
      note: 'Long-liquidation cascade: OI falling with price',
      data: { oi_change_pct: oiPct, price_change_pct: pricePct }
    });
  }
  else if (oiPct < -L2_OI_BUILD_MIN_PCT && pricePct > L2_PRICE_BUILD_MIN_PCT) {
    score += 5;
    details.push('OI↓+P↑ squeeze');
    events.push({
      id: EventId.FLOW_SHORT_SQUEEZE_ACTIVE,
      direction: EventDirection.BULL,
      severity: EventSeverity.HIGH,
      note: 'Short-covering squeeze: OI falling while price rises',
      data: { oi_change_pct: oiPct, price_change_pct: pricePct }
    });
  }

  // L/S Ratio
  if (lsRatio > 2.2) { score -= 14; details.push('극단롱'); }
  else if (lsRatio > 1.6) { score -= 7; details.push('롱과다'); }
  else if (lsRatio < 0.6) { score += 13; details.push('극단숏'); }
  else if (lsRatio < 0.9) { score += 6; details.push('숏우세'); }

  // Taker Ratio
  if (takerRatio > 1.25) { score += 10; details.push('공격매수'); }
  else if (takerRatio > 1.08) { score += 5; details.push('매수우세'); }
  else if (takerRatio < 0.75) { score -= 10; details.push('공격매도'); }
  else if (takerRatio < 0.92) { score -= 5; details.push('매도우세'); }

  return {
    fr,
    oi_change: oiPct,
    ls_ratio: lsRatio,
    taker_ratio: takerRatio,
    price_change: pricePct,
    score: clamp(score, -55, 55),
    detail: details.join(' · ') || 'NEUTRAL',
    events,
  };
}

// ─── L4: Order Book Imbalance ±12 ────────────────────────────

function computeL4(ext: ExtendedMarketData): L4Result {
  const ratio = ext.depth?.ratio ?? 1.0;

  let score = 0;
  let label = 'BALANCED';

  if (ratio > 3.5) { score = 12; label = 'EXTREME BID'; }
  else if (ratio > 2.0) { score = 8; label = 'STRONG BID'; }
  else if (ratio > 1.3) { score = 4; label = 'BID LEAN'; }
  else if (ratio > 0.8) { score = 0; label = 'BALANCED'; }
  else if (ratio > 0.5) { score = -4; label = 'ASK LEAN'; }
  else if (ratio > 0.3) { score = -8; label = 'STRONG ASK'; }
  else { score = -12; label = 'EXTREME ASK'; }

  return { bid_ask_ratio: Math.round(ratio * 100) / 100, score, label };
}

// ─── L5: Liquidation Estimate ±12 ───────────────────────────

function computeL5(ctx: MarketContext, ext: ExtendedMarketData): L5Result {
  const fr = ctx.derivatives?.funding ?? 0;
  const oiPct = ext.oiChangePct ?? 0;
  const cp = ext.currentPrice ?? 0;

  let score = 0;
  let label = 'NEUTRAL';

  if (fr > 0.08 && oiPct > 4) { score = -12; label = 'LONG OVERCROWDED'; }
  else if (fr > 0.05 && oiPct > 2) { score = -8; label = 'LONG BUILDUP'; }
  else if (fr < -0.08 && oiPct > 4) { score = 12; label = 'SHORT OVERCROWDED'; }
  else if (fr < -0.05 && oiPct > 2) { score = 8; label = 'SHORT BUILDUP'; }
  else if (fr > 0.03) { score = -4; label = 'LONG LEAN'; }
  else if (fr < -0.03) { score = 4; label = 'SHORT LEAN'; }

  return {
    basis_pct: Math.round(Math.abs(fr) * 10000) / 100,
    score,
    label,
    liq_long_est: cp > 0 ? Math.round(cp * 0.90) : undefined,
    liq_short_est: cp > 0 ? Math.round(cp * 1.10) : undefined,
  };
}

// ─── L6: BTC On-Chain ±10 ──────────────────────────��────────

function computeL6(ext: ExtendedMarketData): L6Result {
  const nTx = ext.btcOnchain?.nTx ?? 0;
  const avgTxV = ext.btcOnchain?.avgTxValue ?? 0;
  const pending = ext.mempool?.pending ?? 0;
  const fast = ext.mempool?.fastestFee ?? 0;

  let score = 0;
  const details: string[] = [];

  if (nTx > 450000) { score += 4; details.push('very active'); }
  else if (nTx > 300000) { score += 2; details.push('active'); }
  else if (nTx < 150000 && nTx > 0) { score -= 3; details.push('slow'); }

  if (avgTxV > 3.0) { score -= 4; details.push('whale movement'); }
  else if (avgTxV > 1.5) { score -= 2; details.push('whale activity up'); }
  else if (avgTxV > 0) { score += 2; details.push('retail dominant'); }

  if (pending > 100000) { score += 4; details.push('extreme congestion'); }
  else if (pending > 50000) { score += 2; details.push('congested'); }
  else if (pending > 0) { score -= 1; details.push('low demand'); }

  if (fast > 100) { score += 3; details.push('fees surging'); }
  else if (fast > 50) { score += 2; details.push('fees high'); }
  else if (fast > 0) { score -= 1; details.push('fees low'); }

  return {
    n_tx: nTx,
    avg_tx_value: Math.round(avgTxV * 100) / 100,
    mempool_pending: pending,
    fastest_fee: fast,
    score: clamp(score, -10, 10),
    detail: details.join(' · ') || 'NO DATA',
  };
}

// ─��─ L7: Fear & Greed ±8 ────���───────────────────────────────

function computeL7(ctx: MarketContext): L7Result {
  const fgVal = ctx.sentiment?.fearGreed ?? 50;

  let score = 0;
  let label = 'NEUTRAL';

  if (fgVal != null && fgVal <= 15) { score = 8; label = 'EXTREME FEAR'; }
  else if (fgVal != null && fgVal <= 30) { score = 5; label = 'FEAR'; }
  else if (fgVal != null && fgVal <= 45) { score = 2; label = 'MILD FEAR'; }
  else if (fgVal != null && fgVal <= 55) { score = 0; label = 'NEUTRAL'; }
  else if (fgVal != null && fgVal <= 70) { score = -3; label = 'GREED'; }
  else if (fgVal != null && fgVal <= 85) { score = -5; label = 'HIGH GREED'; }
  else if (fgVal != null) { score = -8; label = 'EXTREME GREED'; }

  return { fear_greed: fgVal ?? 50, score, label };
}

// ─── L8: Kimchi Premium ±10 ─────────────────────────────────

function computeL8(ext: ExtendedMarketData): L8Result {
  const prem = ext.kimchiPremium ?? 0;

  let score = 0;
  let label = 'NEUTRAL';

  if (prem > 5) { score = -10; label = 'EXTREME PREMIUM'; }
  else if (prem > 3) { score = -7; label = 'HIGH PREMIUM'; }
  else if (prem > 1.5) { score = -4; label = 'PREMIUM'; }
  else if (prem > 0.5) { score = -2; label = 'MILD PREMIUM'; }
  else if (prem > -0.5) { score = 0; label = 'NEUTRAL'; }
  else if (prem > -2) { score = 2; label = 'MILD DISCOUNT'; }
  else if (prem > -4) { score = 5; label = 'DISCOUNT'; }
  else { score = 8; label = 'DEEP DISCOUNT'; }

  return { kimchi: Math.round(prem * 100) / 100, score, label };
}

// ─── L9: Real Liquidation ±12 ─────��─────────────────────────

function computeL9(ext: ExtendedMarketData): L9Result {
  const orders = ext.forceOrders ?? [];
  const now = Date.now();
  const cp = ext.currentPrice ?? 1;

  let shortLiqUSD = 0;
  let longLiqUSD = 0;

  for (const o of orders) {
    if (now - o.time > 3600000) continue;
    const usd = o.qty * (o.price || cp);
    if (o.side === 'BUY') shortLiqUSD += usd;
    if (o.side === 'SELL') longLiqUSD += usd;
  }

  let score = 0;
  let label = 'QUIET';

  if (shortLiqUSD > 500000 && shortLiqUSD > longLiqUSD * 2) {
    score = 10; label = 'SHORT SQUEEZE ACTIVE';
  } else if (shortLiqUSD > 100000 && shortLiqUSD > longLiqUSD * 1.5) {
    score = 6; label = 'SHORT LIQ DOMINANT';
  } else if (longLiqUSD > 500000 && longLiqUSD > shortLiqUSD * 2) {
    score = -10; label = 'LONG CASCADE';
  } else if (longLiqUSD > 100000 && longLiqUSD > shortLiqUSD * 1.5) {
    score = -6; label = 'LONG LIQ DOMINANT';
  }

  return { liq_long_usd: Math.round(longLiqUSD), liq_short_usd: Math.round(shortLiqUSD), score, label };
}

// ─── L10: MTF Confluence ±20 ────────────────────────────────

function computeL10(ctx: MarketContext): L10Result {
  const results: Array<{ phase: string }> = [];

  if (ctx.klines1h && ctx.klines1h.length >= 80) results.push(computeL1Wyckoff(ctx.klines1h));
  if (ctx.klines && ctx.klines.length >= 80) results.push(computeL1Wyckoff(ctx.klines));
  if (ctx.klines1d && ctx.klines1d.length >= 80) results.push(computeL1Wyckoff(ctx.klines1d));

  let accCount = 0;
  let distCount = 0;

  for (const r of results) {
    if (r.phase === 'ACCUMULATION' || r.phase === 'REACCUM') accCount++;
    if (r.phase === 'DISTRIBUTION' || r.phase === 'REDIST') distCount++;
  }

  let score = 0;
  let label = 'MIXED';
  let mtfConf: MtfConfluence = 'MIXED';

  if (accCount === 3) { score = 18; label = 'TRIPLE ACC ★★★'; mtfConf = 'BULL_ALIGNED'; }
  else if (accCount === 2 && distCount === 0) { score = 10; label = 'STRONG MTF ACC'; mtfConf = 'BULL_ALIGNED'; }
  else if (distCount === 3) { score = -18; label = 'TRIPLE DIST ★★��'; mtfConf = 'BEAR_ALIGNED'; }
  else if (distCount === 2 && accCount === 0) { score = -10; label = 'STRONG MTF DIST'; mtfConf = 'BEAR_ALIGNED'; }
  else if (accCount === 1 && distCount === 1) { score = 0; label = 'MTF CONFLICT'; }
  else if (accCount > 0) { score = 5; label = 'PARTIAL ACC'; }
  else if (distCount > 0) { score = -5; label = 'PARTIAL DIST'; }

  return { mtf_confluence: mtfConf, acc_count: accCount, dist_count: distCount, score, label };
}

// ─── L11: CVD ±12 ───────────────────────────────────────────

function computeL11(klines: BinanceKline[], ext: ExtendedMarketData): L11Result {
  // Prefer 5-min klines for real-time CVD
  type AnyCandle = { open?: number; close?: number; high?: number; low?: number; volume?: number; buyVolume?: number };
  const candles: AnyCandle[] = ext.klines5m && ext.klines5m.length >= 20
    ? ext.klines5m
    : klines;

  if (candles.length < 20) {
    return { cvd_state: 'NEUTRAL', cvd_raw: 0, price_change: 0, absorption: false, score: 0 };
  }

  const recent20 = candles.slice(-20);

  const deltas = recent20.map(c => {
    if (c.buyVolume !== undefined) {
      return c.buyVolume * 2 - (c.volume ?? 0);
    }
    const o = c.open ?? 0;
    const cl = c.close ?? 0;
    const h = c.high ?? 0;
    const l = c.low ?? 0;
    const v = c.volume ?? 0;
    const body = Math.abs(cl - o);
    const range = h - l || 1;
    return cl >= o ? v * (body / range) : -v * (body / range);
  });

  let cum = 0;
  const cvd = deltas.map(d => (cum += d));
  const cvdTrend = cvd[cvd.length - 1] - cvd[0];

  const prices = recent20.map(c => c.close ?? 0);
  const priceStart = prices[0];
  const priceEnd = prices[prices.length - 1];
  const priceChange = priceStart > 0 ? (priceEnd - priceStart) / priceStart : 0;

  const absorption = Math.abs(priceChange) < 0.008 &&
    Math.abs(cvdTrend) > Math.abs(cvd[0]) * 0.3;

  let score = 0;
  let cvdState: CvdState = 'NEUTRAL';

  if (priceChange > 0.005 && cvdTrend > 0) { score = 8; cvdState = 'BULLISH'; }
  else if (priceChange > 0.005 && cvdTrend < 0) { score = -6; cvdState = 'BEARISH_DIVERGENCE'; }
  else if (priceChange < -0.005 && cvdTrend < 0) { score = -8; cvdState = 'BEARISH'; }
  else if (priceChange < -0.005 && cvdTrend > 0) { score = 6; cvdState = 'BULLISH_DIVERGENCE'; }

  if (absorption) {
    score += cvdTrend > 0 ? 4 : -4;
    cvdState = cvdTrend > 0 ? 'ABSORPTION_BUY' : 'ABSORPTION_SELL';
  }

  return {
    cvd_state: cvdState,
    cvd_raw: Math.round(cum),
    price_change: Math.round(priceChange * 10000) / 10000,
    absorption,
    score: clamp(score, -12, 12),
  };
}

// ─── L12: Sector Flow ±10 ───────────────────────────────────

function computeL12(ext: ExtendedMarketData): L12Result {
  const sectorScore = ext.sectorScore ?? 0;
  let score = 0;
  let flow: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL' = 'NEUTRAL';

  if (sectorScore >= 15) { score = 8; flow = 'INFLOW'; }
  else if (sectorScore >= 5) { score = 4; flow = 'INFLOW'; }
  else if (sectorScore <= -15) { score = -8; flow = 'OUTFLOW'; }
  else if (sectorScore <= -5) { score = -4; flow = 'OUTFLOW'; }

  return { sector_flow: flow, sector_score: sectorScore, score: clamp(score, -10, 10) };
}

// ─��─ L15: ATR Volatility ±6 ─────────────────────────��───────

function computeL15(klines: BinanceKline[], ext: ExtendedMarketData): L15Result {
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const cp = ext.currentPrice ?? closes[closes.length - 1] ?? 0;

  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }

  const atrRecent = trs.length >= 14 ? trs.slice(-14).reduce((s, v) => s + v, 0) / 14 : 0;
  const atrOld = trs.length >= 42 ? trs.slice(-42, -28).reduce((s, v) => s + v, 0) / 14 : atrRecent;
  const atrPct = cp > 0 && Number.isFinite(atrRecent) ? (atrRecent / cp) * 100 : 0;

  let volState: VolatilityState = 'NORMAL';
  if (atrOld > 0) {
    if (atrRecent < atrOld * 0.6) volState = 'ULTRA_LOW';
    else if (atrRecent < atrOld * 0.8) volState = 'LOW';
    else if (atrRecent > atrOld * 1.8) volState = 'EXTREME';
    else if (atrRecent > atrOld * 1.3) volState = 'HIGH';
  }

  const stopLong = cp - atrRecent * 1.5;
  const stopShort = cp + atrRecent * 1.5;
  const tp1Long = cp + atrRecent * 2.0;
  const tp2Long = cp + atrRecent * 3.0;
  const slDist = atrRecent * 1.5;
  const rrRatio = slDist > 0 ? (atrRecent * 3.0) / slDist : 0;

  let score = 0;
  if (volState === 'ULTRA_LOW') score = 5;
  else if (volState === 'LOW') score = 3;
  else if (volState === 'EXTREME') score = -4;
  else if (volState === 'HIGH') score = -2;

  return {
    atr_pct: Math.round(atrPct * 100) / 100,
    vol_state: volState,
    stop_long: Math.round(stopLong * 100) / 100,
    stop_short: Math.round(stopShort * 100) / 100,
    tp1_long: Math.round(tp1Long * 100) / 100,
    tp2_long: Math.round(tp2Long * 100) / 100,
    rr_ratio: Math.round(rrRatio * 100) / 100,
    score,
  };
}

// ─── Regime Detection ────���───────────────────────────────────

function detectRegime(
  l1: { phase: string; score: number },
  l10: { mtf_confluence: MtfConfluence; score: number },
  l14: { bb_squeeze: boolean; bb_big_squeeze: boolean; score: number },
  l15: { atr_pct: number },
): Regime {
  if (l15.atr_pct > 4 && !l14.bb_squeeze && Math.abs(l14.score) > 0) return 'BREAKOUT';
  if (l14.bb_squeeze || l14.bb_big_squeeze) return 'RANGE';
  if (l15.atr_pct > 3 && Math.abs(l10.score) < 10) return 'VOLATILE';
  if (l1.phase === 'MARKUP' || (l10.mtf_confluence === 'BULL_ALIGNED' && l1.score > 10)) return 'UPTREND';
  if (l1.phase === 'MARKDOWN' || (l10.mtf_confluence === 'BEAR_ALIGNED' && l1.score < -10)) return 'DOWNTREND';
  if (l15.atr_pct > 3) return 'VOLATILE';
  return 'RANGE';
}

function fundingLabel(fr: number): string {
  if (fr > 0.001) return 'OVERHEAT_LONG';
  if (fr > 0.0005) return 'WARM_LONG';
  if (fr < -0.001) return 'OVERHEAT_SHORT';
  if (fr < -0.0005) return 'WARM_SHORT';
  return 'NEUTRAL';
}

function htfLabel(mtf: MtfConfluence): string {
  if (mtf === 'BULL_ALIGNED') return 'BULLISH';
  if (mtf === 'BEAR_ALIGNED') return 'BEARISH';
  return 'MIXED';
}

// ─── Public API ──���───────────────────────────────────────────

export function computeSignalSnapshot(
  ctx: MarketContext,
  symbol: string,
  timeframe: string,
  ext: ExtendedMarketData = {},
): SignalSnapshot {
  const cp = ext.currentPrice ?? ctx.klines[ctx.klines.length - 1]?.close ?? 0;

  // 17 layers
  const l1 = computeL1Wyckoff(ctx.klines);
  const l2 = computeL2(ctx, ext);

  const l3Candles = ext.klines5m && ext.klines5m.length >= 35
    ? ext.klines5m.map(c => ({ open: c.open, close: c.close, volume: c.volume }))
    : ctx.klines.map(k => ({ open: k.open, close: k.close, volume: k.volume }));
  const l3 = computeL3VSurge(l3Candles);

  const l4 = computeL4(ext);
  const l5 = computeL5(ctx, ext);
  const l6 = computeL6(ext);
  const l7 = computeL7(ctx);
  const l8 = computeL8(ext);
  const l9 = computeL9(ext);
  const l10 = computeL10(ctx);
  const l11 = computeL11(ctx.klines, ext);
  const l12 = computeL12(ext);

  const l13Candles = ext.klines1dExt && ext.klines1dExt.length >= 7
    ? ext.klines1dExt
    : ctx.klines1d && ctx.klines1d.length >= 7
      ? ctx.klines1d
      : ctx.klines;
  const l13 = computeL13Breakout(
    l13Candles.map(c => ({
      high: 'high' in c ? (c as any).high : 0,
      low: 'low' in c ? (c as any).low : 0,
      close: 'close' in c ? (c as any).close : 0,
    })),
    cp,
  );

  const l14 = computeL14BbSqueeze(ctx.klines);
  const l15 = computeL15(ctx.klines, ext);

  const l18Candles = ext.klines5m && ext.klines5m.length >= 12
    ? ext.klines5m.map(c => ({ open: c.open, close: c.close, volume: c.volume }))
    : [];
  const l18 = computeL18Momentum(l18Candles);

  const l19 = computeL19OIAccel(ext.oiHistory5m ?? [], ext.priceChangePct ?? 0);

  // Alpha Score
  const layers = { l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l18, l19 };
  const alphaScore = computeAlphaScore(layers);
  const alphaLbl = toAlphaLabel(alphaScore);

  // Alerts
  const extremeFR = Math.abs(l2.fr) > 0.07;
  const frAlert = extremeFR ? (l2.fr < 0 ? 'SHORT SQUEEZE ALERT' : 'LONG LIQ ALERT') : '';
  const mtfTriple = l10.acc_count === 3 || l10.dist_count === 3;
  const bbBigSqueeze = l14.bb_big_squeeze;

  const verdict = buildVerdict(alphaScore, extremeFR, frAlert, mtfTriple, bbBigSqueeze);
  const regime = detectRegime(l1, l10, l14, l15);
  const compositeScore = Math.round(((alphaScore + 100) / 200) * 100) / 100;

  return {
    l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15, l18, l19,
    alphaScore,
    alphaLabel: alphaLbl,
    verdict,
    regime,
    extremeFR,
    frAlert,
    mtfTriple,
    bbBigSqueeze,
    primaryZone: l1.phase,
    cvdState: l11.cvd_state,
    fundingLabel: fundingLabel(l2.fr),
    htfStructure: htfLabel(l10.mtf_confluence),
    compositeScore,
    symbol,
    timeframe,
    timestamp: Math.floor(Date.now() / 1000),
    hmac: '',
  };
}

// ─── Indicator Series ────────────────────────────────────────

export function computeIndicatorSeries(klines: BinanceKline[]): IndicatorSeries {
  if (klines.length < 20) return {};

  const closes = klines.map(k => k.close);
  const bb = calcBollingerBands(closes, 20, 2);
  const ema20Raw = calcEMA(closes, 20);

  return {
    bbUpper: Array.from(bb.upper) as number[],
    bbMiddle: Array.from(bb.middle) as number[],
    bbLower: Array.from(bb.lower) as number[],
    ema20: Array.from(ema20Raw) as number[],
  };
}
