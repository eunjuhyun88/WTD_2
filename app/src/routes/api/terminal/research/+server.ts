/**
 * POST /api/terminal/research
 *
 * Auto-analyze a selected chart range.
 * Runs heuristic phase detection + signal extraction on the provided
 * klines + market indicator values. Returns a pre-filled analysis result
 * so ResearchPanel can show results without waiting for an LLM call.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const KlineSchema = z.object({
  time: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

const OiBarSchema = z.object({ time: z.number(), value: z.number() });
const FundingBarSchema = z.object({ time: z.number(), rate: z.number() });

const IndicatorContextSchema = z.object({
  rsi14: z.number().optional(),
  fundingRate: z.number().optional(),
  oiChange1h: z.number().optional(),
  emaAlignment: z.string().optional(),
  htfStructure: z.string().optional(),
  volRatio3: z.number().optional(),
  cvdState: z.string().optional(),
  wyckoffScore: z.number().optional(),
  momentumScore: z.number().optional(),
  bbScore: z.number().optional(),
  mtfScore: z.number().optional(),
  lsRatio: z.number().optional(),
  takerBuyRatio: z.number().optional(),
  kimchiScore: z.number().optional(),
  fgScore: z.number().optional(),
  pWin: z.number().optional(),
  direction: z.string().optional(),
}).optional();

const AutoAnalyzeRequestSchema = z.object({
  symbol: z.string().min(1).max(24),
  timeframe: z.string().min(1).max(8),
  klines: z.array(KlineSchema).min(1).max(1000),
  oiBars: z.array(OiBarSchema).max(500).default([]),
  fundingBars: z.array(FundingBarSchema).max(500).default([]),
  cvdLatest: z.number().optional(),
  liqPressure: z.number().optional(),
  noteDraft: z.string().max(2000).default(''),
  indicatorContext: IndicatorContextSchema,
});

type AutoAnalyzeRequest = z.infer<typeof AutoAnalyzeRequestSchema>;
type KlineBar = z.infer<typeof KlineSchema>;

// ---------------------------------------------------------------------------
// Phase detection heuristics
// ---------------------------------------------------------------------------

type Phase = 'FAKE_DUMP' | 'ARCH_ZONE' | 'REAL_DUMP' | 'ACCUMULATION' | 'BREAKOUT' | 'GENERAL';

export interface DetectedSignal {
  id: string;
  label: string;
  detected: boolean;
  value: string;
  weight: number;
}

export interface AnalysisResult {
  phase: Phase;
  phaseConfidence: number;
  signals: DetectedSignal[];
  thesis: string[];
  summary: string;
}

function pctChange(a: number, b: number): number {
  if (a === 0) return 0;
  return (b - a) / a;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function detectPhase(req: AutoAnalyzeRequest): AnalysisResult {
  const { klines, oiBars, fundingBars, cvdLatest, liqPressure, indicatorContext: ic } = req;

  const first = klines[0]!;
  const last = klines[klines.length - 1]!;
  const mid = klines[Math.floor(klines.length / 2)]!;

  const totalReturn = pctChange(first.open, last.close);
  const firstHalfReturn = pctChange(first.open, mid.close);
  const secondHalfReturn = pctChange(mid.close, last.close);

  const lows = klines.map((k: KlineBar) => k.low);
  const highs = klines.map((k: KlineBar) => k.high);
  const closes = klines.map((k: KlineBar) => k.close);
  const volumes = klines.map((k: KlineBar) => k.volume);

  const lowestLow = Math.min(...lows);
  const highestHigh = Math.max(...highs);
  const priceRange = highestHigh - lowestLow;
  const priceRangePct = lowestLow > 0 ? priceRange / lowestLow : 0;

  // Higher lows: last third of bars trending up
  const tail = closes.slice(Math.floor(closes.length * 0.67));
  const higherLows =
    tail.length >= 3 && tail.every((v: number, i: number) => i === 0 || v >= (tail[i - 1] ?? 0) * 0.998);

  // Volume spike: max > 2.5× mean
  const avgVol = volumes.reduce((s: number, v: number) => s + v, 0) / volumes.length;
  const maxVol = Math.max(...volumes);
  const volSpike = maxVol > avgVol * 2.5;

  // Price compression in last third
  const tailCloses = closes.slice(Math.floor(closes.length * 0.67));
  const tailSd = stddev(tailCloses);
  const tailMean = tailCloses.reduce((s: number, v: number) => s + v, 0) / tailCloses.length;
  const compressed = tailMean > 0 && tailSd / tailMean < 0.01;

  // OI
  let oiChangePct = 0;
  let oiSpike = false;
  if (oiBars.length >= 2) {
    const oiFirst = oiBars[0]!.value;
    const oiLast = oiBars[oiBars.length - 1]!.value;
    oiChangePct = pctChange(oiFirst, oiLast);
    const oiMax = Math.max(...oiBars.map((b) => b.value));
    oiSpike = oiMax > oiFirst * 1.15;
  }

  // Funding
  let fundingFlip = false;
  let fundingNegative = false;
  let fundingPositive = false;
  if (fundingBars.length >= 2) {
    const rates = fundingBars.map((b) => b.rate);
    const firstRate = rates[0] ?? 0;
    const lastRate = rates[rates.length - 1] ?? 0;
    fundingFlip = (firstRate < 0 && lastRate >= 0) || (firstRate > 0 && lastRate <= 0);
    fundingNegative = lastRate < -0.0001;
    fundingPositive = lastRate > 0.0001;
  }

  const cvdBuying = (cvdLatest ?? 0) > 0;
  const longSqueezeActive = (liqPressure ?? 0) > 0;

  const signals: DetectedSignal[] = [
    {
      id: 'oi_spike',
      label: 'OI 급등',
      detected: oiSpike,
      value: oiChangePct !== 0 ? `${(oiChangePct * 100).toFixed(1)}%` : '—',
      weight: 0.9,
    },
    {
      id: 'dump_then_reclaim',
      label: '급락 후 회복',
      detected: firstHalfReturn < -0.03 && secondHalfReturn > 0.01,
      value: `1H ${(firstHalfReturn * 100).toFixed(1)}% / 2H ${(secondHalfReturn * 100).toFixed(1)}%`,
      weight: 0.8,
    },
    {
      id: 'higher_lows',
      label: 'Higher Lows',
      detected: higherLows,
      value: higherLows ? '확인' : '—',
      weight: 0.85,
    },
    {
      id: 'funding_flip',
      label: '펀딩 플립',
      detected: fundingFlip,
      value: fundingFlip ? '전환됨' : '—',
      weight: 0.75,
    },
    {
      id: 'funding_negative',
      label: '음수 펀딩',
      detected: fundingNegative,
      value: fundingNegative ? '숏 치우침' : '—',
      weight: 0.6,
    },
    {
      id: 'vol_spike',
      label: '거래량 폭발',
      detected: volSpike,
      value: volSpike ? `${(maxVol / avgVol).toFixed(1)}× 평균` : '—',
      weight: 0.7,
    },
    {
      id: 'compressed',
      label: '박스 압축',
      detected: compressed,
      value: compressed ? '변동성 낮음' : '—',
      weight: 0.65,
    },
    {
      id: 'long_squeeze',
      label: '롱 청산 압력',
      detected: longSqueezeActive,
      value: longSqueezeActive ? '롱 liq > 숏 liq' : '—',
      weight: 0.7,
    },
    {
      id: 'cvd_buying',
      label: 'CVD 매수 우위',
      detected: cvdBuying,
      value: cvdLatest != null ? cvdLatest.toFixed(0) : '—',
      weight: 0.6,
    },
    {
      id: 'breakout_signal',
      label: '박스 돌파',
      detected: priceRangePct > 0.04 && totalReturn > 0.03,
      value: `총 ${(totalReturn * 100).toFixed(1)}%`,
      weight: 0.8,
    },
  ];

  // Phase scoring
  const scores: Record<Phase, number> = {
    FAKE_DUMP: 0,
    ARCH_ZONE: 0,
    REAL_DUMP: 0,
    ACCUMULATION: 0,
    BREAKOUT: 0,
    GENERAL: 0.1,
  };

  if (firstHalfReturn < -0.02 && !oiSpike && !volSpike) scores.FAKE_DUMP += 0.7;
  if (firstHalfReturn < -0.02 && totalReturn > -0.01) scores.FAKE_DUMP += 0.3;

  if (compressed) scores.ARCH_ZONE += 0.6;
  if (Math.abs(totalReturn) < 0.015 && priceRangePct < 0.04) scores.ARCH_ZONE += 0.4;

  if (oiSpike) scores.REAL_DUMP += 0.5;
  if (totalReturn < -0.04 || firstHalfReturn < -0.04) scores.REAL_DUMP += 0.4;
  if (volSpike && oiSpike) scores.REAL_DUMP += 0.3;
  if (longSqueezeActive) scores.REAL_DUMP += 0.2;
  if (fundingNegative) scores.REAL_DUMP += 0.15;

  if (higherLows) scores.ACCUMULATION += 0.5;
  if (fundingFlip) scores.ACCUMULATION += 0.3;
  if (cvdBuying) scores.ACCUMULATION += 0.2;
  if (secondHalfReturn > 0.01 && totalReturn > -0.01) scores.ACCUMULATION += 0.2;

  if (totalReturn > 0.04) scores.BREAKOUT += 0.5;
  if (oiSpike && fundingPositive) scores.BREAKOUT += 0.3;
  if (volSpike && totalReturn > 0.03) scores.BREAKOUT += 0.3;
  if (higherLows && totalReturn > 0.02) scores.BREAKOUT += 0.2;

  // Engine indicator context — adjusts scoring beyond kline heuristics
  if (ic) {
    const rsi = ic.rsi14;
    if (rsi != null) {
      if (rsi < 30) { scores.ACCUMULATION += 0.4; scores.FAKE_DUMP += 0.2; }
      else if (rsi < 40) scores.ACCUMULATION += 0.15;
      else if (rsi > 70) { scores.REAL_DUMP += 0.25; scores.ARCH_ZONE += 0.1; }
      else if (rsi > 60) scores.BREAKOUT += 0.15;
    }
    if (ic.wyckoffScore != null) {
      if (ic.wyckoffScore >= 5)  scores.ACCUMULATION += 0.35;
      if (ic.wyckoffScore <= -5) scores.REAL_DUMP += 0.35;
    }
    if (ic.momentumScore != null) {
      if (ic.momentumScore >= 5)  scores.BREAKOUT += 0.25;
      if (ic.momentumScore <= -5) scores.REAL_DUMP += 0.25;
    }
    if (ic.mtfScore != null) {
      if (ic.mtfScore >= 5)  scores.BREAKOUT += 0.2;
      if (ic.mtfScore <= -5) scores.REAL_DUMP += 0.2;
    }
    if (ic.bbScore != null && Math.abs(ic.bbScore) >= 5) scores.ARCH_ZONE += 0.2;
    if (ic.lsRatio != null) {
      if (ic.lsRatio < 0.85) scores.ACCUMULATION += 0.2;
      if (ic.lsRatio > 1.15) scores.REAL_DUMP += 0.15;
    }
    if (ic.takerBuyRatio != null) {
      if (ic.takerBuyRatio > 1.15) scores.BREAKOUT += 0.15;
      if (ic.takerBuyRatio < 0.85) scores.REAL_DUMP += 0.15;
    }
    if (ic.direction === 'bullish') { scores.ACCUMULATION += 0.2; scores.BREAKOUT += 0.2; }
    else if (ic.direction === 'bearish') { scores.REAL_DUMP += 0.2; scores.FAKE_DUMP += 0.1; }
    if (ic.emaAlignment) {
      const ema = ic.emaAlignment.toLowerCase();
      if (ema.includes('bullish') || ema.includes('bull')) scores.BREAKOUT += 0.15;
      if (ema.includes('bearish') || ema.includes('bear')) scores.REAL_DUMP += 0.15;
    }
    if (ic.kimchiScore != null) {
      if (ic.kimchiScore >= 5)  scores.REAL_DUMP += 0.1;
      if (ic.kimchiScore <= -5) scores.ACCUMULATION += 0.1;
    }
  }

  const entries = Object.entries(scores) as [Phase, number][];
  const topPhase = entries.sort(([, a], [, b]) => b - a)[0]!;
  const phase = topPhase[0];
  const phaseScore = topPhase[1];
  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  const phaseConfidence = total > 0 ? Math.min(0.95, phaseScore / total) : 0.2;

  // Build thesis
  const phaseKo: Record<Phase, string> = {
    FAKE_DUMP: '가짜 급락',
    ARCH_ZONE: '아치 존 (압축)',
    REAL_DUMP: '진짜 급락',
    ACCUMULATION: '축적 구간',
    BREAKOUT: '돌파',
    GENERAL: '일반 셋업',
  };

  const thesis: string[] = [];
  thesis.push(`${phaseKo[phase]} — ${req.symbol.replace('USDT', '')} ${req.timeframe.toUpperCase()}`);
  if (oiSpike) thesis.push(`OI ${(oiChangePct * 100).toFixed(1)}% 급등 — 포지셔닝 이벤트`);
  if (firstHalfReturn < -0.03 && secondHalfReturn > 0.01)
    thesis.push(`급락 ${(firstHalfReturn * 100).toFixed(1)}% 후 되돌림 ${(secondHalfReturn * 100).toFixed(1)}%`);
  if (higherLows) thesis.push('Higher lows 구조 확인 — 축적 진행');
  if (fundingFlip) thesis.push('펀딩 플립 — 포지션 구조 전환');
  if (volSpike) thesis.push(`거래량 폭발 (${(maxVol / avgVol).toFixed(1)}× 평균)`);
  if (longSqueezeActive) thesis.push('롱 청산 압력 활성 — 세력 숏 누르기');
  if (ic) {
    if (ic.rsi14 != null) thesis.push(`RSI ${ic.rsi14.toFixed(1)} (${ic.rsi14 < 30 ? '과매도' : ic.rsi14 > 70 ? '과매수' : '중립'})`);
    if (ic.wyckoffScore != null && Math.abs(ic.wyckoffScore) >= 3)
      thesis.push(`Wyckoff ${ic.wyckoffScore >= 0 ? '+' : ''}${ic.wyckoffScore} — ${ic.wyckoffScore >= 5 ? '축적 신호' : ic.wyckoffScore <= -5 ? '분산 신호' : '전환 구간'}`);
    if (ic.fundingRate != null && Math.abs(ic.fundingRate) > 0.0005)
      thesis.push(`펀딩 ${(ic.fundingRate * 100).toFixed(3)}% — ${ic.fundingRate > 0.01 ? '롱 과열' : ic.fundingRate < -0.005 ? '숏 치우침' : '중립'}`);
    if (ic.lsRatio != null)
      thesis.push(`L/S ${ic.lsRatio.toFixed(2)} — ${ic.lsRatio < 0.85 ? '숏 도미넌트 (역발상 롱)' : ic.lsRatio > 1.15 ? '롱 도미넌트' : '균형'}`);
    if (ic.takerBuyRatio != null)
      thesis.push(`Taker ${ic.takerBuyRatio.toFixed(2)}× — ${ic.takerBuyRatio > 1.1 ? '공격적 매수' : ic.takerBuyRatio < 0.9 ? '공격적 매도' : '균형'}`);
    if (ic.mtfScore != null && Math.abs(ic.mtfScore) >= 3)
      thesis.push(`MTF 정렬 ${ic.mtfScore >= 0 ? '+' : ''}${ic.mtfScore}`);
    if (ic.pWin != null) thesis.push(`엔진 P(win) ${Math.round(ic.pWin * 100)}%`);
  }
  if (req.noteDraft.trim()) thesis.push(req.noteDraft.trim().slice(0, 120));

  const summary = thesis.slice(0, 2).join(' / ');

  return { phase, phaseConfidence, signals, thesis, summary };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ cookies, request }) => {
  // detectPhase is pure computation — no auth required
  // canSave flag controls whether the client can save the result (requires auth)
  const user = await getAuthUserFromCookies(cookies);

  let body: AutoAnalyzeRequest;
  try {
    body = AutoAnalyzeRequestSchema.parse(await request.json());
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const result = detectPhase(body);

  return json({
    ok: true,
    symbol: body.symbol,
    timeframe: body.timeframe,
    phase: result.phase,
    phaseConfidence: result.phaseConfidence,
    signals: result.signals,
    thesis: result.thesis,
    summary: result.summary,
    analyzedAt: Date.now(),
    canSave: !!user,
  });
};
