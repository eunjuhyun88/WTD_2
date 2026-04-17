// ═══════════════════════════════════════════════════════════════
// COGOCHI — Forward-Walk Validation (Phase 5)
// Split scenario into IS (in-sample) / OOS (out-of-sample),
// optimize on IS, validate on OOS, detect overfitting.
// ═══════════════════════════════════════════════════════════════

import { runFullBattle, createDefaultSquad } from '$lib/server/research/v4Battle';
import type {
  BattleScenario,
  BattleTickState,
  SignalWeights,
  OwnedAgent,
  ArchetypeId,
} from '$lib/contracts/researchV4';
import { V4_CONFIG } from '$lib/contracts/researchV4';

// ─── Types ─────────────────────────────────────────────────────

export interface ForwardWalkConfig {
  scenario: BattleScenario;
  archetype: ArchetypeId;
  splitRatio: number;           // 0.7 = 70% IS, 30% OOS
  hillClimbRounds: number;      // number of hill climbing iterations on IS
  userId?: string;
}

export interface SplitMetrics {
  winRate: number;
  totalPnl: number;
  tradeCount: number;
  noTradeCount: number;
  avgRMultiple: number;
  maxDrawdown: number;
  sharpe: number;
}

export interface ForwardWalkResult {
  isMetrics: SplitMetrics;
  oosMetrics: SplitMetrics;
  degradation: number;          // % drop from IS to OOS (negative = improvement)
  overfitRisk: 'low' | 'moderate' | 'high';
  bestWeights: SignalWeights;
  isCandleCount: number;
  oosCandleCount: number;
  rounds: number;
  elapsedMs: number;
}

// ─── Main entry ────────────────────────────────────────────────

export async function runForwardWalk(
  config: ForwardWalkConfig,
  onProgress?: (msg: string) => void,
): Promise<ForwardWalkResult> {
  const startTime = Date.now();
  const { scenario, archetype, splitRatio, hillClimbRounds } = config;
  const userId = config.userId ?? 'forward-walk';

  // 1. Split scenario into IS/OOS
  const splitIdx = Math.floor(scenario.candles.length * splitRatio);
  const isScenario = sliceScenario(scenario, 0, splitIdx, 'IS');
  const oosScenario = sliceScenario(scenario, splitIdx, scenario.candles.length, 'OOS');

  onProgress?.(`Split: IS=${isScenario.candles.length} candles, OOS=${oosScenario.candles.length} candles`);

  // 2. Hill climbing on IS
  const baseWeights: SignalWeights = {
    cvdDivergence: 0.5,
    fundingRate: 0.5,
    openInterest: 0.5,
    htfStructure: 0.5,
  };

  let bestWeights = { ...baseWeights };
  let bestISScore = -Infinity;
  let bestISMetrics: SplitMetrics | null = null;

  // Evaluate base first
  const baseMetrics = await evaluateWeights(isScenario, archetype, baseWeights, userId);
  bestISScore = compositeScore(baseMetrics);
  bestISMetrics = baseMetrics;

  onProgress?.(`Base: winRate=${(baseMetrics.winRate * 100).toFixed(0)}% pnl=${(baseMetrics.totalPnl * 100).toFixed(1)}%`);

  // Hill climbing: perturb one weight at a time
  for (let round = 0; round < hillClimbRounds; round++) {
    const candidate = perturbWeights(bestWeights);
    const metrics = await evaluateWeights(isScenario, archetype, candidate, userId);
    const score = compositeScore(metrics);

    if (score > bestISScore) {
      bestWeights = candidate;
      bestISScore = score;
      bestISMetrics = metrics;
      onProgress?.(`Round ${round + 1}/${hillClimbRounds}: IMPROVED → score=${score.toFixed(3)} winRate=${(metrics.winRate * 100).toFixed(0)}%`);
    }
  }

  // 3. Validate best weights on OOS
  const oosMetrics = await evaluateWeights(oosScenario, archetype, bestWeights, userId);
  onProgress?.(`OOS: winRate=${(oosMetrics.winRate * 100).toFixed(0)}% pnl=${(oosMetrics.totalPnl * 100).toFixed(1)}%`);

  // 4. Calculate degradation
  const isScore = compositeScore(bestISMetrics!);
  const oosScore = compositeScore(oosMetrics);
  const degradation = isScore > 0 ? (isScore - oosScore) / isScore : 0;

  const overfitRisk: 'low' | 'moderate' | 'high' =
    degradation > 0.3 ? 'high'
    : degradation > 0.15 ? 'moderate'
    : 'low';

  return {
    isMetrics: bestISMetrics!,
    oosMetrics,
    degradation,
    overfitRisk,
    bestWeights,
    isCandleCount: isScenario.candles.length,
    oosCandleCount: oosScenario.candles.length,
    rounds: hillClimbRounds,
    elapsedMs: Date.now() - startTime,
  };
}

// ─── Scenario slicing ──────────────────────────────────────────

function sliceScenario(
  scenario: BattleScenario,
  startIdx: number,
  endIdx: number,
  suffix: string,
): BattleScenario {
  const candles = scenario.candles.slice(startIdx, endIdx);
  const startTs = candles[0]?.time ?? 0;
  const endTs = candles[candles.length - 1]?.time ?? 0;

  return {
    id: `${scenario.id}-${suffix}`,
    label: `${scenario.label} (${suffix})`,
    candles,
    oiHistory: scenario.oiHistory.filter(r => r.timestamp >= startTs * 1000 && r.timestamp <= endTs * 1000),
    fundingHistory: scenario.fundingHistory.filter(r => r.timestamp >= startTs * 1000 && r.timestamp <= endTs * 1000),
    lsRatioHistory: scenario.lsRatioHistory.filter(r => r.timestamp >= startTs * 1000 && r.timestamp <= endTs * 1000),
    startTimestamp: startTs * 1000,
    endTimestamp: endTs * 1000,
  };
}

// ─── Evaluate weights on a scenario ────────────────────────────

async function evaluateWeights(
  scenario: BattleScenario,
  archetype: ArchetypeId,
  weights: SignalWeights,
  userId: string,
): Promise<SplitMetrics> {
  const squad = createDefaultSquad(userId, 'FW', archetype);
  for (const agent of squad) {
    agent.loadout.signalWeights = { ...weights };
  }

  const finalState = await runFullBattle(scenario, squad, {
    totalRounds: 1,
    objectiveThreshold: 0.5,
    tickLimit: scenario.candles.length,
  });

  return extractMetrics(finalState);
}

function extractMetrics(state: BattleTickState): SplitMetrics {
  const h = state.tradeHistory;
  const trades = h.trades;
  const wins = trades.filter(t => (t.pnlPercent ?? 0) > 0);
  const losses = trades.filter(t => (t.pnlPercent ?? 0) < 0);

  const winRate = h.tradeCount > 0 ? h.winCount / h.tradeCount : 0;

  // Compute R-multiples (PnL / risk)
  const rMultiples = trades
    .filter(t => t.pnlPercent != null)
    .map(t => {
      const risk = V4_CONFIG.AUTO_SL_PERCENT;
      return (t.pnlPercent ?? 0) / risk;
    });
  const avgRMultiple = rMultiples.length > 0
    ? rMultiples.reduce((s, r) => s + r, 0) / rMultiples.length
    : 0;

  // Max drawdown from cumulative PnL curve
  const pnlCurve = trades.reduce<number[]>((acc, t) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
    acc.push(prev + (t.pnlPercent ?? 0));
    return acc;
  }, []);

  let peak = 0, maxDD = 0;
  for (const p of pnlCurve) {
    if (p > peak) peak = p;
    const dd = peak - p;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe
  const returns = trades.map(t => t.pnlPercent ?? 0);
  const mean = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
    : 0;
  const sharpe = variance > 0 ? mean / Math.sqrt(variance) : 0;

  // Count NO_TRADE ticks (events with ABSTAIN_GATE)
  const noTradeCount = state.events.filter(e =>
    e.detail?.includes('ABSTAIN_GATE')
  ).length;

  return {
    winRate,
    totalPnl: h.totalPnl,
    tradeCount: h.tradeCount,
    noTradeCount,
    avgRMultiple,
    maxDrawdown: maxDD,
    sharpe,
  };
}

// ─── Hill climbing helpers ─────────────────────────────────────

function perturbWeights(base: SignalWeights): SignalWeights {
  const keys: (keyof SignalWeights)[] = ['cvdDivergence', 'fundingRate', 'openInterest', 'htfStructure'];
  const result = { ...base };

  // Perturb 1-2 random weights
  const numPerturb = Math.random() > 0.5 ? 2 : 1;
  for (let i = 0; i < numPerturb; i++) {
    const key = keys[Math.floor(Math.random() * keys.length)];
    const delta = (Math.random() - 0.5) * 0.3; // ±0.15
    result[key] = Math.max(0.1, Math.min(1.0, result[key] + delta));
  }

  return result;
}

function compositeScore(m: SplitMetrics): number {
  // Balanced: winRate (40%) + PnL (30%) + Sharpe (20%) + NO_TRADE precision (10%)
  const pnlNorm = Math.max(0, Math.min(1, (m.totalPnl + 0.15) / 0.25)); // -15% to +10% → 0 to 1
  const sharpeNorm = Math.max(0, Math.min(1, m.sharpe / 3));
  const noTradePrecision = m.noTradeCount > 0 ? 0.5 : 0; // bonus for using NO_TRADE

  return 0.4 * m.winRate + 0.3 * pnlNorm + 0.2 * sharpeNorm + 0.1 * noTradePrecision;
}
