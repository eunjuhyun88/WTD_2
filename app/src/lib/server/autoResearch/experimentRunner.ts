// ═══════════════════════════════════════════════════════════════
// COGOCHI — AutoResearch Experiment Runner
// Runs N parameter experiments via Battle State Machine simulation
// Design: Cogochi_SystemDesign § Step 4 (AutoResearch)
// ═══════════════════════════════════════════════════════════════

import { runFullBattle, createDefaultSquad } from '$lib/server/research/v4Battle';
import type { BattleScenario, OwnedAgent, SignalWeights, BattleTickState } from '$lib/contracts/researchV4';

// ─── Types ─────────────────────────────────────────────────────

export interface ExperimentConfig {
  agentId: string;
  userId: string;
  archetype: 'CRUSHER' | 'RIDER' | 'ORACLE' | 'GUARDIAN';
  scenarios: BattleScenario[];
  totalExperiments: number;
  objective: 'maximize_winrate' | 'minimize_drawdown' | 'maximize_sharpe' | 'balanced';
  baseWeights: SignalWeights;
}

export interface ExperimentResult {
  experimentId: number;
  weights: SignalWeights;
  winRate: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  avgZoneControl: number;
  maxDrawdown: number;
  sharpeRatio: number;
  compositeScore: number;
}

export interface AutoResearchReport {
  bestExperiment: ExperimentResult;
  allResults: ExperimentResult[];
  totalExperiments: number;
  totalBattles: number;
  elapsedMs: number;
  objective: string;
  suggestedWeights: SignalWeights;
}

// ─── Main runner ───────────────────────────────────────────────

export async function runAutoResearch(
  config: ExperimentConfig,
  onProgress?: (done: number, total: number, best: ExperimentResult | null) => void,
): Promise<AutoResearchReport> {
  const startTime = Date.now();
  const results: ExperimentResult[] = [];
  let bestResult: ExperimentResult | null = null;

  // Generate weight combinations (grid search)
  const weightCombos = generateWeightCombinations(
    config.baseWeights,
    config.totalExperiments,
  );

  for (let i = 0; i < weightCombos.length; i++) {
    const weights = weightCombos[i];

    // Run this weight combo across all scenarios
    const result = await runSingleExperiment(
      i, weights, config,
    );

    results.push(result);

    // Track best
    if (!bestResult || result.compositeScore > bestResult.compositeScore) {
      bestResult = result;
    }

    // Progress callback
    onProgress?.(i + 1, weightCombos.length, bestResult);
  }

  return {
    bestExperiment: bestResult!,
    allResults: results.sort((a, b) => b.compositeScore - a.compositeScore),
    totalExperiments: results.length,
    totalBattles: results.length * config.scenarios.length,
    elapsedMs: Date.now() - startTime,
    objective: config.objective,
    suggestedWeights: bestResult!.weights,
  };
}

// ─── Single experiment ─────────────────────────────────────────

async function runSingleExperiment(
  experimentId: number,
  weights: SignalWeights,
  config: ExperimentConfig,
): Promise<ExperimentResult> {
  let totalWins = 0;
  let totalLosses = 0;
  let totalDraws = 0;
  let totalZoneControl = 0;
  let returns: number[] = [];

  for (const scenario of config.scenarios) {
    // Create squad with these specific weights
    const squad = createSquadWithWeights(
      config.userId,
      config.archetype,
      weights,
    );

    // Run full battle
    const finalState = await runFullBattle(scenario, squad, {
      totalRounds: 3,
      objectiveThreshold: 0.7,
      tickLimit: 24,
    });

    // Collect results
    if (finalState.matchResult === 'WIN') totalWins++;
    else if (finalState.matchResult === 'LOSS') totalLosses++;
    else totalDraws++;

    totalZoneControl += finalState.stage.zoneControlScore;

    // Simulated return for Sharpe calculation
    const ret = finalState.matchResult === 'WIN' ? 0.05
      : finalState.matchResult === 'LOSS' ? -0.03
      : 0.001;
    returns.push(ret);
  }

  const totalGames = config.scenarios.length;
  const winRate = totalWins / totalGames;
  const avgZoneControl = totalZoneControl / totalGames;
  const maxDrawdown = calculateMaxDrawdown(returns);
  const sharpeRatio = calculateSharpe(returns);

  // Composite score based on objective
  const compositeScore = calculateCompositeScore(
    config.objective,
    winRate,
    maxDrawdown,
    sharpeRatio,
  );

  return {
    experimentId,
    weights,
    winRate,
    totalWins,
    totalLosses,
    totalDraws,
    avgZoneControl,
    maxDrawdown,
    sharpeRatio,
    compositeScore,
  };
}

// ─── Weight combination generator ──────────────────────────────

function generateWeightCombinations(
  base: SignalWeights,
  count: number,
): SignalWeights[] {
  const combos: SignalWeights[] = [];

  // First: include base weights
  combos.push({ ...base });

  // Grid search around base ±0.3 in 0.1 steps
  const steps = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  for (let i = 1; i < count && combos.length < count; i++) {
    // Random perturbation of base weights
    combos.push({
      cvdDivergence: steps[Math.floor(Math.random() * steps.length)],
      fundingRate: steps[Math.floor(Math.random() * steps.length)],
      openInterest: steps[Math.floor(Math.random() * steps.length)],
      htfStructure: steps[Math.floor(Math.random() * steps.length)],
    });
  }

  return combos.slice(0, count);
}

// ─── Squad factory with custom weights ─────────────────────────

function createSquadWithWeights(
  userId: string,
  archetype: 'CRUSHER' | 'RIDER' | 'ORACLE' | 'GUARDIAN',
  weights: SignalWeights,
): OwnedAgent[] {
  const squad = createDefaultSquad(userId, 'AutoResearch', archetype);

  // Apply custom weights to all agents
  for (const agent of squad) {
    agent.loadout.signalWeights = { ...weights };
  }

  return squad;
}

// ─── Financial metrics ─────────────────────────────────────────

function calculateMaxDrawdown(returns: number[]): number {
  let peak = 0;
  let maxDD = 0;
  let cumulative = 0;

  for (const r of returns) {
    cumulative += r;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDD) maxDD = dd;
  }

  return maxDD;
}

function calculateSharpe(returns: number[], riskFreeRate: number = 0): number {
  if (returns.length < 2) return 0;

  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);

  if (std === 0) return 0;
  return (mean - riskFreeRate) / std;
}

function calculateCompositeScore(
  objective: string,
  winRate: number,
  maxDrawdown: number,
  sharpeRatio: number,
): number {
  switch (objective) {
    case 'maximize_winrate':
      return winRate;
    case 'minimize_drawdown':
      return 1 - maxDrawdown;
    case 'maximize_sharpe':
      return Math.max(0, sharpeRatio);
    case 'balanced':
    default:
      return 0.4 * winRate + 0.3 * (1 - maxDrawdown) + 0.3 * Math.max(0, sharpeRatio / 3);
  }
}
