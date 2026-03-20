// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Factor Computation Engine (B-03)
// ═══════════════════════════════════════════════════════════════
//
// 8 에이전트 × 6 팩터 = 48개 팩터를 계산하는 엔진.
// 각 팩터는 FactorResult { factorId, value: -100~+100, detail } 반환.
//
// 데이터 가용성에 따라 점진 확장:
//   Phase 1: klines 기반 (STRUCTURE, VPA 일부, DERIV 일부)
//   Phase 2: on-chain + social + macro 추가 (B-05, B-11 이후)
//
// 데이터 없을 시 value: 0, detail: 'Data unavailable' 반환.

import type { FactorResult, TrendAnalysis, DivergenceSignal, BinanceKline } from './types';
import { calcSMA, calcEMA, calcRSI, calcATR, calcOBV, calcMACD, calcCVD, calcBollingerBands } from './indicators';
import { analyzeTrend, detectDivergence, analyzeMultiTF } from './trend';

// ─── Market Context (파이프라인 입력) ─────────────────────────

export interface MarketContext {
  pair: string;
  timeframe: string;
  klines: BinanceKline[];
  klines1h?: BinanceKline[];       // MTF용
  klines1d?: BinanceKline[];       // MTF용

  ticker?: {
    change24h: number;
    volume24h: number;
    high24h?: number;
    low24h?: number;
  };

  derivatives?: {
    oi?: number | null;
    funding?: number | null;
    predFunding?: number | null;
    lsRatio?: number | null;
    liqLong?: number;
    liqShort?: number;
  };

  onchain?: {
    mvrv?: number | null;
    nupl?: number | null;
    sopr?: number | null;
    exchangeNetflow?: number | null;
    whaleActivity?: number | null;
    minerFlow?: number | null;
    stablecoinFlow?: number | null;
    activeAddresses?: number | null;
    etfFlow?: number | null;
    realizedCap?: number | null;
    supplyInProfit?: number | null;
  };

  sentiment?: {
    fearGreed?: number | null;
    socialVolume?: number | null;
    socialSentiment?: number | null;
    newsImpact?: number | null;
    searchTrend?: number | null;
  };

  macro?: {
    dxy?: number | null;
    dxyTrend?: TrendAnalysis | null;
    equityTrend?: TrendAnalysis | null;
    yieldTrend?: TrendAnalysis | null;
    btcDominance?: number | null;
    btcDomTrend?: TrendAnalysis | null;
    stablecoinMcap?: number | null;
    stableMcapTrend?: TrendAnalysis | null;
    eventProximity?: number | null;  // 0-100 (100 = 이벤트 임박)
  };
}

// ─── Helpers ──────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function neutralFactor(factorId: string, reason = 'Data unavailable'): FactorResult {
  return { factorId, value: 0, detail: reason };
}

function scoreFactor(factorId: string, value: number, detail: string, extra?: {
  rawValue?: number;
  trend?: TrendAnalysis;
  divergence?: DivergenceSignal;
}): FactorResult {
  return {
    factorId,
    value: clamp(Math.round(value), -100, 100),
    detail,
    ...(extra?.rawValue !== undefined ? { rawValue: extra.rawValue } : {}),
    ...(extra?.trend ? { trend: extra.trend } : {}),
    ...(extra?.divergence ? { divergence: extra.divergence } : {}),
  };
}

function lastValid(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return NaN;
}

// ─── STRUCTURE Factors ───────────────────────────────────────

function computeEmaTrend(ctx: MarketContext): FactorResult {
  const closes = ctx.klines.map(k => k.close);
  if (closes.length < 30) return neutralFactor('EMA_TREND', 'Insufficient kline data');

  const ema7 = calcEMA(closes, 7);
  const ema25 = calcEMA(closes, 25);
  const last7 = lastValid(ema7);
  const last25 = lastValid(ema25);

  if (!Number.isFinite(last7) || !Number.isFinite(last25)) return neutralFactor('EMA_TREND');

  const gap = ((last7 - last25) / last25) * 100;
  const gapTrend = analyzeTrend(ema7.slice(-20).map((v, i) => {
    const b = ema25[closes.length - 20 + i];
    return Number.isFinite(v) && Number.isFinite(b) && b !== 0 ? ((v - b) / b) * 100 : 0;
  }));

  const score = clamp(gap * 15, -100, 100);
  return scoreFactor('EMA_TREND', score,
    `EMA7/25 gap ${gap.toFixed(3)}% · trend ${gapTrend.direction} · strength ${gapTrend.strength.toFixed(0)}`,
    { rawValue: gap, trend: gapTrend }
  );
}

function computeRsiTrend(ctx: MarketContext): FactorResult {
  const closes = ctx.klines.map(k => k.close);
  const rsiArr = calcRSI(closes, 14);
  const rsi = lastValid(rsiArr);
  if (!Number.isFinite(rsi)) return neutralFactor('RSI_TREND');

  const rsiTrend = analyzeTrend(rsiArr.filter(Number.isFinite).slice(-20));
  let score = 0;
  if (rsi > 70) score = clamp((rsi - 50) * 2, 0, 100);
  else if (rsi < 30) score = clamp((rsi - 50) * 2, -100, 0);
  else score = clamp((rsi - 50) * 1.5, -60, 60);

  return scoreFactor('RSI_TREND', score,
    `RSI14 ${rsi.toFixed(1)} · ${rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral zone'} · trend ${rsiTrend.direction}`,
    { rawValue: rsi, trend: rsiTrend }
  );
}

function computeRsiDivergence(ctx: MarketContext): FactorResult {
  const closes = ctx.klines.map(k => k.close);
  const rsiArr = calcRSI(closes, 14);
  const validRsi = rsiArr.filter(Number.isFinite);
  if (validRsi.length < 20) return neutralFactor('RSI_DIVERGENCE');

  const div = detectDivergence(closes.slice(-60), validRsi.slice(-60));
  let score = 0;
  if (div.type === 'BULLISH_DIV') score = clamp(div.confidence * 0.8, 20, 80);
  else if (div.type === 'BEARISH_DIV') score = clamp(-div.confidence * 0.8, -80, -20);
  else if (div.type === 'HIDDEN_BULL') score = clamp(div.confidence * 0.5, 10, 50);
  else if (div.type === 'HIDDEN_BEAR') score = clamp(-div.confidence * 0.5, -50, -10);

  return scoreFactor('RSI_DIVERGENCE', score, div.detail, { divergence: div });
}

function computeMtfAlignment(ctx: MarketContext): FactorResult {
  const closes4h = ctx.klines.map(k => k.close);
  const closes1h = ctx.klines1h?.map(k => k.close) ?? [];
  const closes1d = ctx.klines1d?.map(k => k.close) ?? [];

  if (closes1h.length < 10 && closes1d.length < 10) {
    const trend = analyzeTrend(closes4h);
    const score = trend.direction === 'RISING' ? 40 : trend.direction === 'FALLING' ? -40 : 0;
    return scoreFactor('MTF_ALIGNMENT', score,
      `Single TF only (${ctx.timeframe}) · trend ${trend.direction}`, { trend });
  }

  const mtf = analyzeMultiTF(
    closes1h.length >= 10 ? closes1h : closes4h,
    closes4h,
    closes1d.length >= 10 ? closes1d : closes4h
  );

  let score = 0;
  if (mtf.alignment === 'ALIGNED_BULL') score = 70;
  else if (mtf.alignment === 'ALIGNED_BEAR') score = -70;
  else if (mtf.alignment === 'CONFLICTING') score = 0;

  return scoreFactor('MTF_ALIGNMENT', score,
    `MTF ${mtf.alignment} · 1H ${mtf.tf1h.direction} · 4H ${mtf.tf4h.direction} · 1D ${mtf.tf1d.direction}`
  );
}

function computePriceStructure(ctx: MarketContext): FactorResult {
  const closes = ctx.klines.map(k => k.close);
  if (closes.length < 20) return neutralFactor('PRICE_STRUCTURE');

  const recent = closes.slice(-20);
  let hh = 0, hl = 0, lh = 0, ll = 0;
  for (let i = 2; i < recent.length; i += 2) {
    if (i + 1 >= recent.length) break;
    const prevH = Math.max(recent[i - 2], recent[i - 1]);
    const currH = Math.max(recent[i], recent[i + 1]);
    const prevL = Math.min(recent[i - 2], recent[i - 1]);
    const currL = Math.min(recent[i], recent[i + 1]);
    if (currH > prevH) hh++; else lh++;
    if (currL > prevL) hl++; else ll++;
  }

  const bullStructure = hh + hl;
  const bearStructure = lh + ll;
  const total = Math.max(bullStructure + bearStructure, 1);
  const score = clamp(((bullStructure - bearStructure) / total) * 80, -80, 80);

  return scoreFactor('PRICE_STRUCTURE', score,
    `HH ${hh} · HL ${hl} · LH ${lh} · LL ${ll} → ${score > 20 ? 'bullish structure' : score < -20 ? 'bearish structure' : 'mixed'}`
  );
}

function computeVolTrend(ctx: MarketContext): FactorResult {
  const closes = ctx.klines.map(k => k.close);
  const volumes = ctx.klines.map(k => k.volume);
  if (closes.length < 20) return neutralFactor('VOL_TREND');

  const obv = calcOBV(closes, volumes);
  const obvTrend = analyzeTrend(obv.filter(Number.isFinite).slice(-20));
  const priceTrend = analyzeTrend(closes.slice(-20));
  const aligned = obvTrend.direction === priceTrend.direction;

  let score = 0;
  if (aligned && priceTrend.direction === 'RISING') score = 50;
  else if (aligned && priceTrend.direction === 'FALLING') score = -50;
  else if (!aligned) score = priceTrend.direction === 'RISING' ? -25 : 25;

  return scoreFactor('VOL_TREND', score,
    `OBV trend ${obvTrend.direction} · price trend ${priceTrend.direction} · ${aligned ? 'confirmed' : 'diverging'}`,
    { trend: obvTrend }
  );
}

// ─── VPA Factors ─────────────────────────────────────────────

function computeCvdTrend(ctx: MarketContext): FactorResult {
  const closes = ctx.klines.map(k => k.close);
  const volumes = ctx.klines.map(k => k.volume);
  if (closes.length < 20) return neutralFactor('CVD_TREND');

  const cvd = calcCVD(closes, volumes);
  const cvdTrend = analyzeTrend(cvd.filter(Number.isFinite).slice(-30));
  const score = clamp(cvdTrend.slope * 100, -80, 80);

  return scoreFactor('CVD_TREND', score,
    `CVD trend ${cvdTrend.direction} · slope ${cvdTrend.slope.toFixed(3)} · strength ${cvdTrend.strength.toFixed(0)}`,
    { trend: cvdTrend }
  );
}

function computeBuySellRatio(ctx: MarketContext): FactorResult {
  const klines = ctx.klines.slice(-20);
  if (klines.length < 10) return neutralFactor('BUY_SELL_RATIO');

  let buyVol = 0, sellVol = 0;
  for (let i = 1; i < klines.length; i++) {
    const vol = klines[i].volume;
    if (klines[i].close >= klines[i - 1].close) buyVol += vol;
    else sellVol += vol;
  }

  const total = buyVol + sellVol;
  const ratio = total > 0 ? buyVol / total : 0.5;
  const score = clamp((ratio - 0.5) * 200, -70, 70);

  return scoreFactor('BUY_SELL_RATIO', score,
    `Buy ${(ratio * 100).toFixed(1)}% / Sell ${((1 - ratio) * 100).toFixed(1)}% · ${score > 15 ? 'buy dominant' : score < -15 ? 'sell dominant' : 'balanced'}`,
    { rawValue: ratio }
  );
}

function computeVolProfile(ctx: MarketContext): FactorResult {
  const klines = ctx.klines.slice(-60);
  if (klines.length < 20) return neutralFactor('VOL_PROFILE');

  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min;
  if (range <= 0) return neutralFactor('VOL_PROFILE', 'No price range');

  const bins = 10;
  const binVol = new Array(bins).fill(0);
  for (let i = 0; i < closes.length; i++) {
    const bin = Math.min(Math.floor(((closes[i] - min) / range) * bins), bins - 1);
    binVol[bin] += volumes[i];
  }

  const pocBin = binVol.indexOf(Math.max(...binVol));
  const pocPrice = min + (pocBin + 0.5) * (range / bins);
  const lastClose = closes[closes.length - 1];
  const positionVsPoc = ((lastClose - pocPrice) / range) * 100;
  const score = clamp(positionVsPoc * 0.6, -60, 60);

  return scoreFactor('VOL_PROFILE', score,
    `POC ~${pocPrice.toFixed(0)} · price ${positionVsPoc > 0 ? 'above' : 'below'} POC · deviation ${Math.abs(positionVsPoc).toFixed(1)}%`,
    { rawValue: pocPrice }
  );
}

function computeAbsorption(ctx: MarketContext): FactorResult {
  const klines = ctx.klines.slice(-20);
  if (klines.length < 10) return neutralFactor('ABSORPTION');

  const avgVol = klines.reduce((s, k) => s + k.volume, 0) / klines.length;
  const last5 = klines.slice(-5);
  let absorptionScore = 0;
  for (const k of last5) {
    const bodyPct = Math.abs(k.close - k.open) / Math.max(k.high - k.low, 0.0001);
    if (k.volume > avgVol * 1.5 && bodyPct < 0.3) {
      absorptionScore += k.close > k.open ? 15 : -15;
    }
  }

  return scoreFactor('ABSORPTION', clamp(absorptionScore, -60, 60),
    `Absorption signal ${absorptionScore > 0 ? 'bullish (buying)' : absorptionScore < 0 ? 'bearish (selling)' : 'none detected'}`,
    { rawValue: absorptionScore }
  );
}

function computeVolDivergence(ctx: MarketContext): FactorResult {
  const closes = ctx.klines.map(k => k.close);
  const volumes = ctx.klines.map(k => k.volume);
  if (closes.length < 30) return neutralFactor('VOL_DIVERGENCE');

  const div = detectDivergence(closes.slice(-60), volumes.slice(-60));
  let score = 0;
  if (div.type === 'BULLISH_DIV') score = clamp(div.confidence * 0.7, 15, 65);
  else if (div.type === 'BEARISH_DIV') score = clamp(-div.confidence * 0.7, -65, -15);

  return scoreFactor('VOL_DIVERGENCE', score,
    `Volume divergence: ${div.type} · ${div.detail}`, { divergence: div }
  );
}

function computeClimaxSignal(ctx: MarketContext): FactorResult {
  const klines = ctx.klines.slice(-30);
  if (klines.length < 15) return neutralFactor('CLIMAX_SIGNAL');

  const avgVol = klines.slice(0, -5).reduce((s, k) => s + k.volume, 0) / Math.max(klines.length - 5, 1);
  const last5 = klines.slice(-5);
  let climaxDetected = false;
  let climaxDir = 0;

  for (const k of last5) {
    if (k.volume > avgVol * 2.5) {
      climaxDetected = true;
      climaxDir += k.close > k.open ? -20 : 20; // climax = reversal signal
    }
  }

  const score = climaxDetected ? clamp(climaxDir, -70, 70) : 0;
  return scoreFactor('CLIMAX_SIGNAL', score,
    climaxDetected ? `Volume climax detected · reversal bias ${climaxDir > 0 ? 'bullish' : 'bearish'}` : 'No climax detected',
    { rawValue: climaxDetected ? 1 : 0 }
  );
}

// ─── ICT Factors (proxy-based until B-11) ────────────────────

function computeLiquidityPool(ctx: MarketContext): FactorResult {
  const klines = ctx.klines.slice(-60);
  if (klines.length < 20) return neutralFactor('LIQUIDITY_POOL');

  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const lastClose = klines[klines.length - 1].close;
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const range = recentHigh - recentLow;
  if (range <= 0) return neutralFactor('LIQUIDITY_POOL');

  const distToHigh = (recentHigh - lastClose) / range;
  const distToLow = (lastClose - recentLow) / range;
  const score = clamp((distToLow - distToHigh) * 60, -60, 60);

  return scoreFactor('LIQUIDITY_POOL', score,
    `Liquidity above ${recentHigh.toFixed(0)} (${(distToHigh * 100).toFixed(1)}%) · below ${recentLow.toFixed(0)} (${(distToLow * 100).toFixed(1)}%)`,
    { rawValue: lastClose }
  );
}

function computeFvg(ctx: MarketContext): FactorResult {
  const klines = ctx.klines.slice(-30);
  if (klines.length < 5) return neutralFactor('FVG');

  let bullFvg = 0, bearFvg = 0;
  for (let i = 2; i < klines.length; i++) {
    const gap = klines[i].low - klines[i - 2].high;
    if (gap > 0) bullFvg++;
    const gapDown = klines[i - 2].low - klines[i].high;
    if (gapDown > 0) bearFvg++;
  }

  const score = clamp((bullFvg - bearFvg) * 15, -60, 60);
  return scoreFactor('FVG', score,
    `Bullish FVGs ${bullFvg} · Bearish FVGs ${bearFvg}`
  );
}

function computeOrderBlock(ctx: MarketContext): FactorResult {
  const klines = ctx.klines.slice(-30);
  if (klines.length < 10) return neutralFactor('ORDER_BLOCK');

  const avgVol = klines.reduce((s, k) => s + k.volume, 0) / klines.length;
  let bullOb = 0, bearOb = 0;
  for (let i = 1; i < klines.length - 1; i++) {
    const k = klines[i];
    if (k.volume > avgVol * 1.8) {
      if (k.close > k.open && klines[i + 1].close > k.close) bullOb++;
      if (k.close < k.open && klines[i + 1].close < k.close) bearOb++;
    }
  }

  const score = clamp((bullOb - bearOb) * 20, -60, 60);
  return scoreFactor('ORDER_BLOCK', score,
    `Bullish OBs ${bullOb} · Bearish OBs ${bearOb}`
  );
}

function computeBosChoch(ctx: MarketContext): FactorResult {
  const closes = ctx.klines.map(k => k.close);
  if (closes.length < 20) return neutralFactor('BOS_CHOCH');

  const trend = analyzeTrend(closes.slice(-40));
  const recentTrend = analyzeTrend(closes.slice(-10));
  const isChoch = trend.direction !== 'FLAT' && trend.direction !== recentTrend.direction;

  let score = 0;
  if (isChoch) {
    score = recentTrend.direction === 'RISING' ? 50 : recentTrend.direction === 'FALLING' ? -50 : 0;
  } else {
    score = trend.direction === 'RISING' ? 30 : trend.direction === 'FALLING' ? -30 : 0;
  }

  return scoreFactor('BOS_CHOCH', score,
    isChoch ? `CHoCH detected: ${trend.direction} → ${recentTrend.direction}` : `BOS: trend ${trend.direction} continues`
  );
}

function computeDisplacement(ctx: MarketContext): FactorResult {
  const klines = ctx.klines.slice(-10);
  if (klines.length < 3) return neutralFactor('DISPLACEMENT');

  const atrArr = calcATR(
    ctx.klines.map(k => k.high),
    ctx.klines.map(k => k.low),
    ctx.klines.map(k => k.close),
    14
  );
  const atr = lastValid(atrArr);
  if (!Number.isFinite(atr) || atr <= 0) return neutralFactor('DISPLACEMENT');

  let maxDisp = 0, dispDir = 0;
  for (const k of klines.slice(-3)) {
    const body = Math.abs(k.close - k.open);
    if (body > atr * 1.5) {
      maxDisp = Math.max(maxDisp, body / atr);
      dispDir += k.close > k.open ? 1 : -1;
    }
  }

  const score = maxDisp > 0 ? clamp(dispDir * maxDisp * 25, -80, 80) : 0;
  return scoreFactor('DISPLACEMENT', score,
    maxDisp > 0 ? `Displacement ${maxDisp.toFixed(1)}x ATR · direction ${dispDir > 0 ? 'bullish' : 'bearish'}` : 'No displacement detected'
  );
}

function computePremiumDiscount(ctx: MarketContext): FactorResult {
  const klines = ctx.klines.slice(-60);
  if (klines.length < 20) return neutralFactor('PREMIUM_DISCOUNT');

  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const eq = (high + low) / 2;
  const lastClose = klines[klines.length - 1].close;
  const range = high - low;
  if (range <= 0) return neutralFactor('PREMIUM_DISCOUNT');

  const position = (lastClose - low) / range;
  const score = clamp((0.5 - position) * 120, -60, 60);

  return scoreFactor('PREMIUM_DISCOUNT', score,
    `Price at ${(position * 100).toFixed(0)}% of range · ${position > 0.7 ? 'premium zone' : position < 0.3 ? 'discount zone' : 'equilibrium'}`,
    { rawValue: position }
  );
}

// ─── DERIV Factors ───────────────────────────────────────────

function computeOiPriceConv(ctx: MarketContext): FactorResult {
  if (!ctx.derivatives?.oi) return neutralFactor('OI_PRICE_CONV', 'OI data unavailable');
  const closes = ctx.klines.map(k => k.close);
  const priceTrend = analyzeTrend(closes.slice(-20));
  const score = priceTrend.direction === 'RISING' ? 30 : priceTrend.direction === 'FALLING' ? -30 : 0;

  return scoreFactor('OI_PRICE_CONV', score,
    `OI available · price trend ${priceTrend.direction} · convergence proxy`,
    { trend: priceTrend }
  );
}

function computeFrTrend(ctx: MarketContext): FactorResult {
  const funding = ctx.derivatives?.funding;
  if (funding == null) return neutralFactor('FR_TREND', 'Funding rate unavailable');

  let score = 0;
  if (funding > 0.0006) score = -50;
  else if (funding > 0.0003) score = -25;
  else if (funding < -0.0006) score = 50;
  else if (funding < -0.0003) score = 25;

  return scoreFactor('FR_TREND', score,
    `Funding ${(funding * 100).toFixed(4)}% · ${funding > 0.0006 ? 'overheated longs' : funding < -0.0006 ? 'overheated shorts' : 'neutral'}`,
    { rawValue: funding }
  );
}

function computeLiquidationTrend(ctx: MarketContext): FactorResult {
  const liqLong = ctx.derivatives?.liqLong ?? 0;
  const liqShort = ctx.derivatives?.liqShort ?? 0;
  if (liqLong === 0 && liqShort === 0) return neutralFactor('LIQUIDATION_TREND', 'Liquidation data unavailable');

  const total = liqLong + liqShort;
  const bias = total > 0 ? (liqShort - liqLong) / total : 0;
  const score = clamp(bias * 70, -70, 70);

  return scoreFactor('LIQUIDATION_TREND', score,
    `Liq Long ${(liqLong / 1e6).toFixed(1)}M · Short ${(liqShort / 1e6).toFixed(1)}M · bias ${bias > 0 ? 'short squeeze' : 'long squeeze'}`,
    { rawValue: bias }
  );
}

function computeLsRatioTrend(ctx: MarketContext): FactorResult {
  const ls = ctx.derivatives?.lsRatio;
  if (ls == null) return neutralFactor('LS_RATIO_TREND', 'L/S ratio unavailable');

  let score = 0;
  if (ls > 1.15) score = -40;
  else if (ls > 1.05) score = -20;
  else if (ls < 0.85) score = 40;
  else if (ls < 0.95) score = 20;

  return scoreFactor('LS_RATIO_TREND', score,
    `L/S ratio ${ls.toFixed(2)} · ${ls > 1.1 ? 'crowded longs' : ls < 0.9 ? 'crowded shorts' : 'balanced'}`,
    { rawValue: ls }
  );
}

function computeOiDivergence(ctx: MarketContext): FactorResult {
  if (!ctx.derivatives?.oi) return neutralFactor('OI_DIVERGENCE', 'OI data unavailable');
  return neutralFactor('OI_DIVERGENCE', 'OI time-series not yet available — awaiting B-05');
}

function computeSqueezeSignal(ctx: MarketContext): FactorResult {
  const funding = ctx.derivatives?.funding;
  const ls = ctx.derivatives?.lsRatio;
  if (funding == null && ls == null) return neutralFactor('SQUEEZE_SIGNAL');

  let score = 0;
  if (funding != null && Math.abs(funding) > 0.0008) {
    score += funding > 0 ? -30 : 30;
  }
  if (ls != null) {
    if (ls > 1.2) score -= 20;
    else if (ls < 0.8) score += 20;
  }

  return scoreFactor('SQUEEZE_SIGNAL', clamp(score, -70, 70),
    `Squeeze potential: funding ${funding != null ? (funding * 100).toFixed(4) + '%' : '—'} · L/S ${ls != null ? ls.toFixed(2) : '—'}`
  );
}

// ─── VALUATION Factors (on-chain, proxy until B-05) ──────────

function computeMvrvZone(ctx: MarketContext): FactorResult {
  const mvrv = ctx.onchain?.mvrv;
  if (mvrv == null) return neutralFactor('MVRV_ZONE', 'MVRV data unavailable');

  let score = 0;
  if (mvrv > 3.5) score = -80;
  else if (mvrv > 2.5) score = -40;
  else if (mvrv < 1.0) score = 80;
  else if (mvrv < 1.5) score = 40;
  else score = clamp((2.0 - mvrv) * 40, -30, 30);

  return scoreFactor('MVRV_ZONE', score,
    `MVRV ${mvrv.toFixed(2)} · ${mvrv > 3.0 ? 'overvalued' : mvrv < 1.0 ? 'undervalued' : 'fair range'}`,
    { rawValue: mvrv }
  );
}

function computeNuplTrend(ctx: MarketContext): FactorResult {
  const nupl = ctx.onchain?.nupl;
  if (nupl == null) return neutralFactor('NUPL_TREND', 'NUPL data unavailable');

  let score = 0;
  if (nupl > 0.75) score = -70;
  else if (nupl > 0.5) score = -30;
  else if (nupl < 0) score = 70;
  else if (nupl < 0.25) score = 30;

  return scoreFactor('NUPL_TREND', score,
    `NUPL ${nupl.toFixed(3)} · ${nupl > 0.75 ? 'euphoria' : nupl < 0 ? 'capitulation' : 'normal'}`,
    { rawValue: nupl }
  );
}

function computeSoprSignal(ctx: MarketContext): FactorResult {
  const sopr = ctx.onchain?.sopr;
  if (sopr == null) return neutralFactor('SOPR_SIGNAL', 'SOPR data unavailable');

  const score = clamp((1 - sopr) * 150, -60, 60);
  return scoreFactor('SOPR_SIGNAL', score,
    `SOPR ${sopr.toFixed(4)} · ${sopr > 1.05 ? 'profit taking' : sopr < 0.98 ? 'capitulation' : 'neutral'}`,
    { rawValue: sopr }
  );
}

function computeCyclePosition(ctx: MarketContext): FactorResult {
  return neutralFactor('CYCLE_POSITION', 'Cycle analysis requires halving data — proxy pending');
}

function computeRealizedCapTrend(ctx: MarketContext): FactorResult {
  const rc = ctx.onchain?.realizedCap;
  if (rc == null) return neutralFactor('REALIZED_CAP_TREND', 'Realized cap data unavailable');
  return scoreFactor('REALIZED_CAP_TREND', 0, `Realized cap ${(rc / 1e9).toFixed(1)}B — trend analysis pending`, { rawValue: rc });
}

function computeSupplyProfit(ctx: MarketContext): FactorResult {
  const sp = ctx.onchain?.supplyInProfit;
  if (sp == null) return neutralFactor('SUPPLY_PROFIT', 'Supply profit data unavailable');

  const score = clamp((sp - 0.75) * 200, -60, 60);
  return scoreFactor('SUPPLY_PROFIT', score,
    `Supply in profit ${(sp * 100).toFixed(1)}% · ${sp > 0.9 ? 'euphoria zone' : sp < 0.5 ? 'capitulation zone' : 'normal'}`,
    { rawValue: sp }
  );
}

// ─── FLOW Factors (on-chain, proxy until B-05) ───────────────

function computeExchangeFlow(ctx: MarketContext): FactorResult {
  const flow = ctx.onchain?.exchangeNetflow;
  if (flow == null) return neutralFactor('EXCHANGE_FLOW', 'Exchange flow data unavailable');

  const score = clamp(-flow * 0.5, -70, 70);
  return scoreFactor('EXCHANGE_FLOW', score,
    `Exchange netflow ${flow > 0 ? '+' : ''}${flow.toFixed(0)} BTC · ${flow > 0 ? 'inflow (sell pressure)' : 'outflow (accumulation)'}`,
    { rawValue: flow }
  );
}

function computeWhaleActivity(ctx: MarketContext): FactorResult {
  const whale = ctx.onchain?.whaleActivity;
  if (whale == null) return neutralFactor('WHALE_ACTIVITY', 'Whale data unavailable');
  return scoreFactor('WHALE_ACTIVITY', clamp(whale, -70, 70),
    `Whale activity score ${whale.toFixed(0)}`, { rawValue: whale });
}

function computeMinerFlow(ctx: MarketContext): FactorResult {
  const mf = ctx.onchain?.minerFlow;
  if (mf == null) return neutralFactor('MINER_FLOW', 'Miner flow data unavailable');
  return scoreFactor('MINER_FLOW', clamp(-mf * 0.3, -50, 50),
    `Miner flow ${mf > 0 ? 'selling' : 'holding'} · ${Math.abs(mf).toFixed(0)} BTC`, { rawValue: mf });
}

function computeStablecoinFlow(ctx: MarketContext): FactorResult {
  const sf = ctx.onchain?.stablecoinFlow;
  if (sf == null) return neutralFactor('STABLECOIN_FLOW', 'Stablecoin flow data unavailable');
  return scoreFactor('STABLECOIN_FLOW', clamp(sf * 0.1, -50, 50),
    `Stablecoin flow ${sf > 0 ? 'expanding' : 'contracting'}`, { rawValue: sf });
}

function computeActiveAddresses(ctx: MarketContext): FactorResult {
  const aa = ctx.onchain?.activeAddresses;
  if (aa == null) return neutralFactor('ACTIVE_ADDRESSES', 'Active address data unavailable');
  return scoreFactor('ACTIVE_ADDRESSES', 0, `Active addresses proxy — trend analysis pending`, { rawValue: aa });
}

function computeEtfFlow(ctx: MarketContext): FactorResult {
  const etf = ctx.onchain?.etfFlow;
  if (etf == null) return neutralFactor('ETF_FLOW', 'ETF flow data unavailable');
  return scoreFactor('ETF_FLOW', clamp(etf * 0.5, -60, 60),
    `ETF flow ${etf > 0 ? '+' : ''}${etf.toFixed(0)}M · ${etf > 0 ? 'inflow' : 'outflow'}`, { rawValue: etf });
}

// ─── SENTI Factors (proxy until B-11) ────────────────────────

function computeFgTrend(ctx: MarketContext): FactorResult {
  const fg = ctx.sentiment?.fearGreed;
  if (fg == null) return neutralFactor('FG_TREND', 'Fear & Greed data unavailable');

  const score = clamp((fg - 50) * 1.4, -70, 70);
  return scoreFactor('FG_TREND', score,
    `Fear & Greed ${fg} · ${fg > 75 ? 'extreme greed' : fg > 60 ? 'greed' : fg < 25 ? 'extreme fear' : fg < 40 ? 'fear' : 'neutral'}`,
    { rawValue: fg }
  );
}

function computeSocialVolume(ctx: MarketContext): FactorResult {
  const sv = ctx.sentiment?.socialVolume;
  if (sv == null) return neutralFactor('SOCIAL_VOLUME', 'Social volume data unavailable');
  return scoreFactor('SOCIAL_VOLUME', clamp(sv, -60, 60),
    `Social volume score ${sv.toFixed(0)}`, { rawValue: sv });
}

function computeSocialSentiment(ctx: MarketContext): FactorResult {
  const ss = ctx.sentiment?.socialSentiment;
  if (ss == null) return neutralFactor('SOCIAL_SENTIMENT', 'Social sentiment data unavailable');
  return scoreFactor('SOCIAL_SENTIMENT', clamp(ss, -60, 60),
    `Social sentiment score ${ss.toFixed(0)}`, { rawValue: ss });
}

function computeNewsImpact(ctx: MarketContext): FactorResult {
  const ni = ctx.sentiment?.newsImpact;
  if (ni == null) return neutralFactor('NEWS_IMPACT', 'News impact data unavailable');
  return scoreFactor('NEWS_IMPACT', clamp(ni, -60, 60),
    `News impact score ${ni.toFixed(0)}`, { rawValue: ni });
}

function computeSearchTrend(ctx: MarketContext): FactorResult {
  const st = ctx.sentiment?.searchTrend;
  if (st == null) return neutralFactor('SEARCH_TREND', 'Search trend data unavailable');
  return scoreFactor('SEARCH_TREND', clamp(st, -50, 50),
    `Search trend score ${st.toFixed(0)}`, { rawValue: st });
}

function computeContrarianSignal(ctx: MarketContext): FactorResult {
  const fg = ctx.sentiment?.fearGreed;
  if (fg == null) return neutralFactor('CONTRARIAN_SIGNAL', 'Contrarian signal needs F&G data');

  let score = 0;
  if (fg > 80) score = -60;
  else if (fg > 70) score = -30;
  else if (fg < 20) score = 60;
  else if (fg < 30) score = 30;

  return scoreFactor('CONTRARIAN_SIGNAL', score,
    `Contrarian: F&G ${fg} · ${fg > 75 ? 'fade extreme greed' : fg < 25 ? 'buy extreme fear' : 'no extreme'}`,
    { rawValue: fg }
  );
}

// ─── MACRO Factors ───────────────────────────────────────────

function computeDxyTrend(ctx: MarketContext): FactorResult {
  const trend = ctx.macro?.dxyTrend;
  if (!trend) return neutralFactor('DXY_TREND', 'DXY data unavailable');

  const score = trend.direction === 'RISING' ? clamp(-trend.strength, -70, 0) :
    trend.direction === 'FALLING' ? clamp(trend.strength, 0, 70) : 0;

  return scoreFactor('DXY_TREND', score,
    `DXY ${trend.direction} · strength ${trend.strength.toFixed(0)} (inverse correlation)`,
    { trend }
  );
}

function computeEquityTrend(ctx: MarketContext): FactorResult {
  const trend = ctx.macro?.equityTrend;
  if (!trend) return neutralFactor('EQUITY_TREND', 'Equity data unavailable');

  const score = trend.direction === 'RISING' ? clamp(trend.strength * 0.6, 0, 50) :
    trend.direction === 'FALLING' ? clamp(-trend.strength * 0.6, -50, 0) : 0;

  return scoreFactor('EQUITY_TREND', score,
    `Equity ${trend.direction} · strength ${trend.strength.toFixed(0)} (positive correlation)`,
    { trend }
  );
}

function computeYieldTrend(ctx: MarketContext): FactorResult {
  const trend = ctx.macro?.yieldTrend;
  if (!trend) return neutralFactor('YIELD_TREND', 'Yield data unavailable');

  const score = trend.direction === 'RISING' ? clamp(-trend.strength * 0.5, -50, 0) :
    trend.direction === 'FALLING' ? clamp(trend.strength * 0.5, 0, 50) : 0;

  return scoreFactor('YIELD_TREND', score,
    `10Y yield ${trend.direction} · ${trend.direction === 'RISING' ? 'tightening' : 'easing'}`,
    { trend }
  );
}

function computeBtcDominance(ctx: MarketContext): FactorResult {
  const trend = ctx.macro?.btcDomTrend;
  if (!trend) return neutralFactor('BTC_DOMINANCE', 'BTC dominance data unavailable');

  const score = trend.direction === 'RISING' ? 20 : trend.direction === 'FALLING' ? -15 : 0;
  return scoreFactor('BTC_DOMINANCE', score,
    `BTC dominance ${trend.direction}`, { trend });
}

function computeStablecoinMcap(ctx: MarketContext): FactorResult {
  const trend = ctx.macro?.stableMcapTrend;
  if (!trend) return neutralFactor('STABLECOIN_MCAP', 'Stablecoin MCap data unavailable');

  const score = trend.direction === 'RISING' ? 30 : trend.direction === 'FALLING' ? -30 : 0;
  return scoreFactor('STABLECOIN_MCAP', score,
    `Stablecoin MCap ${trend.direction} · ${trend.direction === 'RISING' ? 'liquidity expanding' : 'contracting'}`,
    { trend }
  );
}

function computeEventProximity(ctx: MarketContext): FactorResult {
  const ep = ctx.macro?.eventProximity;
  if (ep == null) return neutralFactor('EVENT_PROXIMITY', 'No event data');

  return scoreFactor('EVENT_PROXIMITY', 0,
    `Event proximity ${ep}/100 · ${ep > 70 ? 'major event imminent — high uncertainty' : ep > 40 ? 'event approaching' : 'no major events'}`,
    { rawValue: ep }
  );
}

// ─── Factor Registry ─────────────────────────────────────────

type FactorFn = (ctx: MarketContext) => FactorResult;

const FACTOR_REGISTRY: Record<string, FactorFn> = {
  // STRUCTURE
  EMA_TREND: computeEmaTrend,
  RSI_TREND: computeRsiTrend,
  RSI_DIVERGENCE: computeRsiDivergence,
  MTF_ALIGNMENT: computeMtfAlignment,
  PRICE_STRUCTURE: computePriceStructure,
  VOL_TREND: computeVolTrend,
  // VPA
  CVD_TREND: computeCvdTrend,
  BUY_SELL_RATIO: computeBuySellRatio,
  VOL_PROFILE: computeVolProfile,
  ABSORPTION: computeAbsorption,
  VOL_DIVERGENCE: computeVolDivergence,
  CLIMAX_SIGNAL: computeClimaxSignal,
  // ICT
  LIQUIDITY_POOL: computeLiquidityPool,
  FVG: computeFvg,
  ORDER_BLOCK: computeOrderBlock,
  BOS_CHOCH: computeBosChoch,
  DISPLACEMENT: computeDisplacement,
  PREMIUM_DISCOUNT: computePremiumDiscount,
  // DERIV
  OI_PRICE_CONV: computeOiPriceConv,
  FR_TREND: computeFrTrend,
  LIQUIDATION_TREND: computeLiquidationTrend,
  LS_RATIO_TREND: computeLsRatioTrend,
  OI_DIVERGENCE: computeOiDivergence,
  SQUEEZE_SIGNAL: computeSqueezeSignal,
  // VALUATION
  MVRV_ZONE: computeMvrvZone,
  NUPL_TREND: computeNuplTrend,
  SOPR_SIGNAL: computeSoprSignal,
  CYCLE_POSITION: computeCyclePosition,
  REALIZED_CAP_TREND: computeRealizedCapTrend,
  SUPPLY_PROFIT: computeSupplyProfit,
  // FLOW
  EXCHANGE_FLOW: computeExchangeFlow,
  WHALE_ACTIVITY: computeWhaleActivity,
  MINER_FLOW: computeMinerFlow,
  STABLECOIN_FLOW: computeStablecoinFlow,
  ACTIVE_ADDRESSES: computeActiveAddresses,
  ETF_FLOW: computeEtfFlow,
  // SENTI
  FG_TREND: computeFgTrend,
  SOCIAL_VOLUME: computeSocialVolume,
  SOCIAL_SENTIMENT: computeSocialSentiment,
  NEWS_IMPACT: computeNewsImpact,
  SEARCH_TREND: computeSearchTrend,
  CONTRARIAN_SIGNAL: computeContrarianSignal,
  // MACRO
  DXY_TREND: computeDxyTrend,
  EQUITY_TREND: computeEquityTrend,
  YIELD_TREND: computeYieldTrend,
  BTC_DOMINANCE: computeBtcDominance,
  STABLECOIN_MCAP: computeStablecoinMcap,
  EVENT_PROXIMITY: computeEventProximity,
};

// ─── Public API ──────────────────────────────────────────────

/** 단일 팩터 계산 */
export function computeFactor(factorId: string, ctx: MarketContext): FactorResult {
  const fn = FACTOR_REGISTRY[factorId];
  if (!fn) return neutralFactor(factorId, `Unknown factor: ${factorId}`);
  try {
    return fn(ctx);
  } catch (err: any) {
    return neutralFactor(factorId, `Error: ${err?.message ?? 'unknown'}`);
  }
}

/** 에이전트의 모든 팩터 계산 */
export function computeAgentFactors(factorIds: string[], ctx: MarketContext): FactorResult[] {
  return factorIds.map(id => computeFactor(id, ctx));
}
