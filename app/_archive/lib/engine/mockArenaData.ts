// ═══════════════════════════════════════════════════════════════
// WTD — Arena War Mock Data Generator
// ═══════════════════════════════════════════════════════════════
//
// 프로토타입용 목 데이터 — 48팩터, C02Result, 히스토리컬 캔들
// 실제 API 연동 전까지 게임 루프를 테스트하기 위한 용도

import type {
  BinanceKline,
  FactorResult,
  AgentId,
  AgentOutput,
  Direction,
  C02Result,
  OrpoOutput,
  CtxBelief,
  CtxFlag,
  GuardianCheck,
  CommanderVerdict,
  MarketRegime,
  FBScore,
} from './types';
import type { MarketContext } from './factorEngine';
import { AGENT_POOL } from './agents';

// ─── Seeded Random ──────────────────────────────────────────

let _seed = Date.now();

function seededRandom(): number {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}

function randRange(min: number, max: number): number {
  return min + seededRandom() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

// ─── Mock Klines ────────────────────────────────────────────

export function generateMockKlines(
  count: number,
  basePrice: number,
  volatility = 0.015
): BinanceKline[] {
  const klines: BinanceKline[] = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);
  const interval = 4 * 3600; // 4h candles

  for (let i = 0; i < count; i++) {
    const change = (seededRandom() - 0.48) * volatility * price;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.abs(change) * seededRandom() * 0.5;
    const low = Math.min(open, close) - Math.abs(change) * seededRandom() * 0.5;
    const volume = randRange(500, 5000);

    klines.push({
      time: now - (count - i) * interval,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume),
    });

    price = close;
  }

  return klines;
}

/**
 * 배틀용 미래 캔들 생성 (24개, 5초 간격 애니메이션)
 * direction bias를 주면 해당 방향으로 약간 편향됨
 */
export function generateBattleKlines(
  startPrice: number,
  bias: Direction = 'NEUTRAL',
  count = 24
): BinanceKline[] {
  const klines: BinanceKline[] = [];
  let price = startPrice;
  const now = Math.floor(Date.now() / 1000);

  const biasMultiplier =
    bias === 'LONG' ? 0.55 :
    bias === 'SHORT' ? 0.42 :
    0.50;

  for (let i = 0; i < count; i++) {
    const volatility = 0.008 + seededRandom() * 0.012;
    const direction = seededRandom() < biasMultiplier ? 1 : -1;
    const change = direction * volatility * price;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + seededRandom() * 0.003);
    const low = Math.min(open, close) * (1 - seededRandom() * 0.003);
    const volume = randRange(800, 4000);

    klines.push({
      time: now + i * 5,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume),
    });

    price = close;
  }

  return klines;
}

// ─── Mock 48 Factors ────────────────────────────────────────

function generateFactorResult(factorId: string, biasValue?: number): FactorResult {
  const base = biasValue ?? randRange(-60, 60);
  const noise = randRange(-15, 15);
  const value = Math.round(Math.max(-100, Math.min(100, base + noise)));

  const rawValueMap: Record<string, () => number | undefined> = {
    RSI_TREND: () => 50 + value * 0.4,
    EMA_TREND: () => undefined,
    FG_TREND: () => 50 + value * 0.45,
    MVRV_ZONE: () => 1.0 + value * 0.02,
    FR_TREND: () => value * 0.001,
  };

  const rawFn = rawValueMap[factorId];
  const rawValue = rawFn ? rawFn() : undefined;

  const direction = value > 0 ? 'bullish' : value < 0 ? 'bearish' : 'neutral';
  const strength = Math.abs(value) > 50 ? 'strong' : Math.abs(value) > 20 ? 'moderate' : 'weak';

  return {
    factorId,
    value,
    rawValue: rawValue !== undefined ? Math.round(rawValue * 100) / 100 : undefined,
    detail: `${factorId}: ${strength} ${direction} (${value > 0 ? '+' : ''}${value})`,
  };
}

export function generateMock48Factors(biasDirection: Direction = 'NEUTRAL'): FactorResult[] {
  const factors: FactorResult[] = [];
  const bias =
    biasDirection === 'LONG' ? 15 :
    biasDirection === 'SHORT' ? -15 :
    0;

  const allAgents = Object.values(AGENT_POOL);
  for (const agent of allAgents) {
    for (const factorDef of agent.factors) {
      // Some factors get stronger bias based on agent role
      const agentBias = agent.role === 'OFFENSE' ? bias * 1.2 : bias * 0.8;
      factors.push(generateFactorResult(factorDef.id, agentBias));
    }
  }

  return factors;
}

// ─── Mock Agent Outputs ─────────────────────────────────────

function generateAgentOutput(
  agentId: AgentId,
  factors: FactorResult[],
  specId: string
): AgentOutput {
  const agentDef = AGENT_POOL[agentId as keyof typeof AGENT_POOL];
  if (!agentDef) throw new Error(`Unknown agent: ${agentId}`);

  const agentFactors = factors.filter(f =>
    agentDef.factors.some(fd => fd.id === f.factorId)
  );

  const bullScore = agentFactors
    .filter(f => f.value > 0)
    .reduce((sum, f) => sum + f.value, 0);
  const bearScore = Math.abs(
    agentFactors
      .filter(f => f.value < 0)
      .reduce((sum, f) => sum + f.value, 0)
  );

  const netScore = bullScore - bearScore;
  const total = bullScore + bearScore || 1;
  const confidence = Math.round(50 + (Math.abs(netScore) / total) * 45);

  let direction: Direction;
  if (netScore > 15) direction = 'LONG';
  else if (netScore < -15) direction = 'SHORT';
  else direction = 'NEUTRAL';

  return {
    agentId,
    specId,
    direction,
    confidence: Math.min(95, Math.max(30, confidence)),
    thesis: `${agentDef.nameKR}: ${direction} ${confidence}% — 팩터 ${agentFactors.length}개 분석`,
    factors: agentFactors,
    bullScore,
    bearScore,
  };
}

// ─── Mock C02 Result ────────────────────────────────────────

export function generateMockC02Result(
  factors: FactorResult[],
  marketBias: Direction = 'NEUTRAL'
): C02Result {
  // OFFENSE agents → ORPO
  const structureOutput = generateAgentOutput('STRUCTURE', factors, 'structure_base');
  const vpaOutput = generateAgentOutput('VPA', factors, 'vpa_base');
  const ictOutput = generateAgentOutput('ICT', factors, 'ict_base');

  // Weighted ORPO synthesis
  const offenseOutputs = [structureOutput, vpaOutput, ictOutput];
  const weights = { STRUCTURE: 0.4, VPA: 0.35, ICT: 0.25 };

  let longScore = 0;
  let shortScore = 0;
  let totalConf = 0;
  let totalWeight = 0;

  for (const o of offenseOutputs) {
    const w = weights[o.agentId as keyof typeof weights] ?? 0.33;
    totalWeight += w;
    totalConf += o.confidence * w;
    if (o.direction === 'LONG') longScore += w * o.confidence;
    else if (o.direction === 'SHORT') shortScore += w * o.confidence;
  }

  const spread = Math.abs(longScore - shortScore);
  let orpoDirection: Direction;
  if (spread < 5) orpoDirection = 'NEUTRAL';
  else if (longScore > shortScore) orpoDirection = 'LONG';
  else orpoDirection = 'SHORT';

  const orpoConfidence = totalWeight > 0 ? Math.round(totalConf / totalWeight) : 50;

  const orpo: OrpoOutput = {
    direction: orpoDirection,
    confidence: orpoConfidence,
    pattern: spread > 30 ? 'STRONG_TREND' : spread > 15 ? 'MODERATE_SIGNAL' : 'MIXED',
    keyLevels: {
      support: 97800,
      resistance: 99500,
    },
    factors,
    thesis: `ORPO: ${orpoDirection} ${orpoConfidence}% [STR:${structureOutput.direction} | VPA:${vpaOutput.direction} | ICT:${ictOutput.direction}]`,
  };

  // CTX agents
  const ctxAgents = ['DERIV', 'FLOW', 'SENTI', 'MACRO'] as const;
  const ctx: CtxBelief[] = ctxAgents.map(agentId => {
    const output = generateAgentOutput(agentId, factors, `${agentId.toLowerCase()}_base`);
    let flag: CtxFlag;
    if (output.confidence < 55 || output.direction === 'NEUTRAL') flag = 'NEUTRAL';
    else if (output.direction === 'LONG') flag = 'GREEN';
    else flag = 'RED';

    const topFactor = [...output.factors].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];

    return {
      agentId,
      flag,
      confidence: output.confidence,
      headline: topFactor ? `${agentId}: ${topFactor.detail}` : `${agentId}: ${flag}`,
      factors: output.factors,
    };
  });

  // Guardian
  const rsiFactors = factors.filter(f => f.factorId.includes('RSI') && f.rawValue !== undefined);
  const hasExtremeRSI = rsiFactors.some(f => (f.rawValue ?? 0) >= 95);

  const guardian: GuardianCheck = {
    passed: !hasExtremeRSI,
    violations: hasExtremeRSI
      ? [{ rule: 'RSI_95', detail: 'RSI extreme overbought', severity: 'BLOCK' as const }]
      : [],
    halt: hasExtremeRSI,
  };

  // Commander — check conflict
  const greenCount = ctx.filter(c => c.flag === 'GREEN').length;
  const redCount = ctx.filter(c => c.flag === 'RED').length;
  const ctxConsensus: Direction =
    greenCount > redCount ? 'LONG' :
    redCount > greenCount ? 'SHORT' : 'NEUTRAL';

  const hasConflict =
    orpoDirection !== 'NEUTRAL' &&
    ctxConsensus !== 'NEUTRAL' &&
    orpoDirection !== ctxConsensus;

  let commander: CommanderVerdict | null = null;
  if (hasConflict) {
    const strongDissenters = ctx.filter(c =>
      c.flag !== 'NEUTRAL' &&
      c.confidence >= 70 &&
      ((c.flag === 'RED' && orpoDirection === 'LONG') ||
       (c.flag === 'GREEN' && orpoDirection === 'SHORT'))
    );

    const penalizedConf = Math.max(0, orpoConfidence - strongDissenters.length * 10);

    commander = {
      finalDirection: strongDissenters.length >= 3 ? ctxConsensus : orpoDirection,
      entryScore: penalizedConf,
      reasoning: strongDissenters.length >= 3
        ? `CTX override: ${strongDissenters.length}/4 agents disagree. Deferring to CTX.`
        : `ORPO maintained with reduced confidence (-${strongDissenters.length * 10}).`,
      conflictResolved: true,
      cost: 0,
    };
  }

  return {
    orpo,
    ctx,
    guardian,
    commander,
    timestamp: Date.now(),
  };
}

// ─── Mock AI Decision ───────────────────────────────────────

export interface MockAIDecision {
  direction: Direction;
  confidence: number;
  entryPrice: number;
  tp: number;
  sl: number;
  c02Result: C02Result;
}

export function generateMockAIDecision(
  currentPrice: number,
  factors: FactorResult[]
): MockAIDecision {
  const c02Result = generateMockC02Result(factors);

  const direction = c02Result.commander
    ? c02Result.commander.finalDirection
    : c02Result.orpo.direction;

  const confidence = c02Result.commander
    ? c02Result.commander.entryScore
    : c02Result.orpo.confidence;

  const entryPrice = currentPrice;
  const atr = currentPrice * 0.015; // ~1.5% ATR estimate

  let tp: number;
  let sl: number;

  if (direction === 'LONG') {
    tp = Math.round((entryPrice + atr * 2.5) * 100) / 100;
    sl = Math.round((entryPrice - atr * 1.2) * 100) / 100;
  } else if (direction === 'SHORT') {
    tp = Math.round((entryPrice - atr * 2.5) * 100) / 100;
    sl = Math.round((entryPrice + atr * 1.2) * 100) / 100;
  } else {
    tp = Math.round((entryPrice + atr) * 100) / 100;
    sl = Math.round((entryPrice - atr) * 100) / 100;
  }

  return {
    direction,
    confidence,
    entryPrice,
    tp,
    sl,
    c02Result,
  };
}

// ─── Mock Market Context ────────────────────────────────────

export function generateMockMarketContext(
  pair = 'BTCUSDT',
  timeframe = '4h'
): { marketContext: MarketContext; currentPrice: number; regime: MarketRegime } {
  const basePrice = pair === 'BTCUSDT' ? 98500 : pair === 'ETHUSDT' ? 3200 : 180;
  const klines = generateMockKlines(100, basePrice);
  const currentPrice = klines[klines.length - 1].close;

  // Determine regime from recent price action
  const recent = klines.slice(-10);
  const firstClose = recent[0].close;
  const lastClose = recent[recent.length - 1].close;
  const change = (lastClose - firstClose) / firstClose;
  const volatility = recent.reduce((sum, k) => sum + (k.high - k.low) / k.close, 0) / recent.length;

  let regime: MarketRegime;
  if (volatility > 0.03) regime = 'volatile';
  else if (change > 0.02) regime = 'trending_up';
  else if (change < -0.02) regime = 'trending_down';
  else regime = 'ranging';

  const marketContext: MarketContext = {
    pair,
    timeframe,
    klines,
    ticker: {
      change24h: change * 100,
      volume24h: randRange(1e9, 5e9),
      high24h: currentPrice * 1.02,
      low24h: currentPrice * 0.98,
    },
    derivatives: {
      oi: randRange(8e9, 15e9),
      funding: randRange(-0.01, 0.03),
      predFunding: randRange(-0.005, 0.02),
      lsRatio: randRange(0.8, 1.2),
      liqLong: randRange(1e6, 5e7),
      liqShort: randRange(1e6, 5e7),
    },
    onchain: {
      mvrv: randRange(0.8, 3.5),
      nupl: randRange(-0.2, 0.7),
      sopr: randRange(0.95, 1.05),
      exchangeNetflow: randRange(-5000, 5000),
      whaleActivity: randRange(10, 100),
      minerFlow: randRange(-1000, 1000),
      stablecoinFlow: randRange(-1e8, 1e8),
      activeAddresses: randRange(500000, 1000000),
      etfFlow: randRange(-500, 500),
      realizedCap: randRange(3e11, 5e11),
      supplyInProfit: randRange(50, 95),
    },
    sentiment: {
      fearGreed: randRange(20, 80),
      socialVolume: randRange(1000, 50000),
      socialSentiment: randRange(-50, 50),
      newsImpact: randRange(-30, 30),
      searchTrend: randRange(20, 80),
    },
    macro: {
      dxy: randRange(100, 107),
      btcDominance: randRange(45, 60),
      stablecoinMcap: randRange(1.5e11, 2e11),
      eventProximity: randRange(0, 100),
    },
  };

  return { marketContext, currentPrice, regime };
}

// ─── Mock FBS Score ─────────────────────────────────────────

export function generateMockFBS(isWinner: boolean): FBScore {
  if (isWinner) {
    const ds = randInt(60, 95);
    const re = randInt(50, 90);
    const ci = randInt(55, 90);
    return {
      ds,
      re,
      ci,
      fbs: Math.round(0.5 * ds + 0.3 * re + 0.2 * ci),
    };
  } else {
    const ds = randInt(20, 65);
    const re = randInt(25, 60);
    const ci = randInt(30, 70);
    return {
      ds,
      re,
      ci,
      fbs: Math.round(0.5 * ds + 0.3 * re + 0.2 * ci),
    };
  }
}

// ─── Factor Signature ───────────────────────────────────────

export function computeFactorSignature(factors: FactorResult[]): number[] {
  // Top 10 factors by absolute value → normalized to [-1, 1]
  return [...factors]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 10)
    .map(f => f.value / 100);
}

// ─── Detect Patterns ────────────────────────────────────────

export function detectPatterns(factors: FactorResult[]): string[] {
  const patterns: string[] = [];

  const ema = factors.find(f => f.factorId === 'EMA_TREND');
  const rsi = factors.find(f => f.factorId === 'RSI_TREND');
  const rsiDiv = factors.find(f => f.factorId === 'RSI_DIVERGENCE');
  const cvd = factors.find(f => f.factorId === 'CVD_TREND');
  const mtf = factors.find(f => f.factorId === 'MTF_ALIGNMENT');
  const bos = factors.find(f => f.factorId === 'BOS_CHOCH');

  if (ema && ema.value > 40 && mtf && mtf.value > 40) patterns.push('TREND_CONTINUATION');
  if (rsiDiv && Math.abs(rsiDiv.value) > 30) patterns.push('RSI_DIVERGENCE');
  if (cvd && Math.abs(cvd.value) > 40) patterns.push('VOLUME_DIVERGENCE');
  if (bos && Math.abs(bos.value) > 50) patterns.push('STRUCTURE_BREAK');
  if (ema && rsi && Math.sign(ema.value) !== Math.sign(rsi.value)) patterns.push('MIXED_SIGNALS');

  return patterns;
}
