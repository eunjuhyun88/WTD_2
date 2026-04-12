// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — FBS Scoring & LP Engine (C02-aligned)
// ═══════════════════════════════════════════════════════════════
//
// FBS = 0.5·DS + 0.3·RE + 0.2·CI
//   DS = Decision Score   (direction, alignment, override, timing)
//   RE = Risk/Execution   (R:R, SL quality, TP achievement)
//   CI = Confidence Index  (calibration accuracy)

import type {
  Direction,
  FBScore,
  AgentOutput,
  GuardianViolation,
  OrpoOutput,
} from './types';

// ─── Constants ──────────────────────────────────────────────

const DS_WEIGHT = 0.5;
const RE_WEIGHT = 0.3;
const CI_WEIGHT = 0.2;

// LP policy
const LP_PVE_WIN_BASE = 8;
const LP_PVE_LOSS = -3;
const LP_DISSENT_BONUS = 5;
const LP_PERFECT_READ = 3;
const LP_STREAK_BONUS_PER = 2;      // per streak level (3+)
const LP_STREAK_MAX_BONUS = 10;

// ─── Helpers ────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function directionMatch(a: Direction, b: Direction): boolean {
  return a === b && a !== 'NEUTRAL';
}

// ─── DS Sub-scores ──────────────────────────────────────────

/**
 * Direction Score: Did the user pick the right direction?
 * +100 if correct, 0 if neutral, -50 if wrong
 */
function directionScore(userDir: Direction, actualDir: Direction): number {
  if (userDir === 'NEUTRAL') return 30;
  if (directionMatch(userDir, actualDir)) return 100;
  // User picked opposite
  if (actualDir !== 'NEUTRAL') return 0;
  // Actual was neutral — partial credit
  return 40;
}

/**
 * Alignment Score: Did user agree/disagree with ORPO?
 * DISSENT WIN gets a bonus.
 */
function alignmentScore(
  userDir: Direction,
  orpoDir: Direction,
  actualDir: Direction
): number {
  const userCorrect = directionMatch(userDir, actualDir);
  const userAligned = directionMatch(userDir, orpoDir);

  // DISSENT WIN: user disagreed with ORPO and was right
  if (userCorrect && !userAligned && orpoDir !== 'NEUTRAL') return 100;
  // CONSENSUS WIN: user agreed with ORPO and was right
  if (userCorrect && userAligned) return 80;
  // Agreed but wrong
  if (!userCorrect && userAligned) return 30;
  // Dissent but wrong
  if (!userCorrect && !userAligned) return 10;
  return 50;
}

/**
 * Override Score: How did user respond to Guardian warnings?
 * Respecting BLOCK violations → high score. Ignoring → low.
 */
function overrideScore(
  violations: GuardianViolation[],
  userOverrode: boolean
): number {
  if (violations.length === 0) return 70; // No violations to judge
  const hasBlock = violations.some(v => v.severity === 'BLOCK');
  if (hasBlock && !userOverrode) return 100;  // Respected block
  if (hasBlock && userOverrode) return 10;     // Ignored block
  // Only WARN violations
  if (!userOverrode) return 80;
  return 40; // Overrode warnings
}

/**
 * Timing Score: How close was user's entry to the optimal entry?
 * Measured as % deviation from optimal.
 */
function timingScore(
  userEntry: number,
  optimalEntry: number
): number {
  if (optimalEntry <= 0 || userEntry <= 0) return 50;
  const deviation = Math.abs(userEntry - optimalEntry) / optimalEntry;
  // 0% deviation → 100, 2%+ → 20
  return Math.round(clamp(100 - deviation * 4000, 20, 100));
}

// ─── RE Sub-scores ──────────────────────────────────────────

/**
 * Risk:Reward ratio score
 * R:R >= 3 → 100, R:R >= 2 → 80, R:R >= 1.5 → 60, < 1 → 20
 */
function rrScore(riskReward: number): number {
  if (riskReward >= 3) return 100;
  if (riskReward >= 2) return 80;
  if (riskReward >= 1.5) return 60;
  if (riskReward >= 1) return 40;
  return 20;
}

/**
 * Stop-loss quality: How well placed was SL relative to key level?
 * Measures distance from swing low/high.
 */
function slQualityScore(
  slPrice: number,
  keyLevel: number,
  entryPrice: number
): number {
  if (entryPrice <= 0 || keyLevel <= 0) return 50;
  const slDist = Math.abs(slPrice - keyLevel) / entryPrice;
  // SL near key level (within 0.5%) → best. Far away → worse.
  if (slDist < 0.005) return 100;
  if (slDist < 0.01) return 80;
  if (slDist < 0.02) return 60;
  return 30;
}

/**
 * TP achievement: Did price reach TP? How far did it go?
 */
function tpAchievementScore(
  tpPrice: number,
  exitPrice: number,
  entryPrice: number,
  direction: Direction
): number {
  if (entryPrice <= 0) return 50;
  const tpDist = Math.abs(tpPrice - entryPrice);
  const exitDist = direction === 'LONG'
    ? exitPrice - entryPrice
    : entryPrice - exitPrice;

  if (tpDist <= 0) return 50;
  const ratio = exitDist / tpDist;
  // Reached TP → 100, 80%+ → 90, 50%+ → 70, etc.
  if (ratio >= 1.0) return 100;
  if (ratio >= 0.8) return 90;
  if (ratio >= 0.5) return 70;
  if (ratio >= 0) return 40;
  return 10; // Went against direction
}

// ─── CI Sub-score ───────────────────────────────────────────

/**
 * Calibration: user said X% confidence → did it match outcome?
 * Uses Brier-like scoring.
 */
function calibrationScore(
  userConfidence: number,    // 0-100
  outcomeCorrect: boolean
): number {
  const prob = clamp(userConfidence / 100, 0.01, 0.99);
  const outcome = outcomeCorrect ? 1 : 0;
  // Brier score: (prob - outcome)^2, inverted and scaled
  const brier = Math.pow(prob - outcome, 2);
  // Perfect calibration → brier=0 → score=100
  return Math.round(clamp((1 - brier) * 100, 0, 100));
}

// ─── Main FBS Computation ───────────────────────────────────

export interface FBSInput {
  // User hypothesis
  userDir: Direction;
  userConfidence: number;       // 0-100
  userEntry: number;
  userTP: number;
  userSL: number;
  userRR: number;

  // ORPO output
  orpoDir: Direction;
  orpoKeyLevels?: { support: number; resistance: number };

  // Guardian
  guardianViolations: GuardianViolation[];
  userOverrodeGuardian: boolean;

  // Outcome
  actualDir: Direction;         // Based on price movement
  exitPrice: number;
  optimalEntry?: number;        // Best possible entry
}

export function computeFBS(input: FBSInput): FBScore {
  const {
    userDir, userConfidence, userEntry, userTP, userSL, userRR,
    orpoDir, orpoKeyLevels,
    guardianViolations, userOverrodeGuardian,
    actualDir, exitPrice, optimalEntry,
  } = input;

  const outcomeCorrect = directionMatch(userDir, actualDir);

  // ── DS (Decision Score) ──
  const dsDirection = directionScore(userDir, actualDir) * 0.3;
  const dsAlignment = alignmentScore(userDir, orpoDir, actualDir) * 0.2;
  const dsOverride = overrideScore(guardianViolations, userOverrodeGuardian) * 0.2;
  const dsTiming = timingScore(userEntry, optimalEntry ?? userEntry) * 0.3;
  const ds = Math.round(clamp(dsDirection + dsAlignment + dsOverride + dsTiming, 0, 100));

  // ── RE (Risk/Execution) ──
  const reRR = rrScore(userRR) * 0.4;
  const keyLevel = userDir === 'LONG'
    ? (orpoKeyLevels?.support ?? userSL)
    : (orpoKeyLevels?.resistance ?? userSL);
  const reSL = slQualityScore(userSL, keyLevel, userEntry) * 0.3;
  const reTP = tpAchievementScore(userTP, exitPrice, userEntry, userDir) * 0.3;
  const re = Math.round(clamp(reRR + reSL + reTP, 0, 100));

  // ── CI (Confidence Index) ──
  const ci = calibrationScore(userConfidence, outcomeCorrect);

  // ── FBS ──
  const fbs = Math.round(DS_WEIGHT * ds + RE_WEIGHT * re + CI_WEIGHT * ci);

  return { ds, re, ci, fbs };
}

// ─── LP Calculation (C02-aligned) ───────────────────────────

export interface LPCalcInput {
  win: boolean;
  streak: number;
  fbs: FBScore;
  isDissent: boolean;           // User disagreed with ORPO and won
  isPerfectRead: boolean;       // FBS >= 90
  consensusType: 'consensus' | 'partial' | 'dissent' | 'override';
}

export function calculateLP(win: boolean, streak: number, lpMult: number): number {
  if (win) {
    const base = LP_PVE_WIN_BASE + (streak >= 3 ? Math.min((streak - 2) * LP_STREAK_BONUS_PER, LP_STREAK_MAX_BONUS) : 0);
    return Math.round(base * lpMult);
  }
  return LP_PVE_LOSS;
}

export function calculateLPv2(input: LPCalcInput): { lp: number; breakdown: string[] } {
  const breakdown: string[] = [];
  let lp = 0;

  if (input.win) {
    // Base
    lp += LP_PVE_WIN_BASE;
    breakdown.push(`Base: +${LP_PVE_WIN_BASE}`);

    // Streak bonus
    if (input.streak >= 3) {
      const streakBonus = Math.min((input.streak - 2) * LP_STREAK_BONUS_PER, LP_STREAK_MAX_BONUS);
      lp += streakBonus;
      breakdown.push(`Streak ${input.streak}: +${streakBonus}`);
    }

    // Consensus multiplier
    const mult = input.consensusType === 'consensus' ? 1.5
      : input.consensusType === 'partial' ? 1.0
      : input.consensusType === 'dissent' ? 0.7
      : 1.0;
    if (mult !== 1.0) {
      lp = Math.round(lp * mult);
      breakdown.push(`${input.consensusType}: x${mult}`);
    }

    // DISSENT WIN bonus
    if (input.isDissent) {
      lp += LP_DISSENT_BONUS;
      breakdown.push(`Dissent Win: +${LP_DISSENT_BONUS}`);
    }

    // Perfect Read bonus
    if (input.isPerfectRead) {
      lp += LP_PERFECT_READ;
      breakdown.push(`Perfect Read: +${LP_PERFECT_READ}`);
    }
  } else {
    lp = LP_PVE_LOSS;
    breakdown.push(`Loss: ${LP_PVE_LOSS}`);
  }

  return { lp, breakdown };
}

// ─── Consensus Detection ────────────────────────────────────

export function determineConsensus(
  userDir: string,
  agentDirs: string[],
  hasGuardianOverride: boolean
): { type: 'consensus' | 'partial' | 'dissent' | 'override'; lpMult: number; badge: string } {
  if (hasGuardianOverride) return { type: 'override', lpMult: 1.0, badge: 'OVERRIDE' };

  const longs = agentDirs.filter(d => d === 'LONG').length;
  const agentDir = longs > agentDirs.length / 2 ? 'LONG' : 'SHORT';
  const match = userDir === agentDir;

  if (match && longs >= Math.ceil(agentDirs.length * 0.8))
    return { type: 'consensus', lpMult: 1.5, badge: 'CONSENSUS x1.5' };
  if (match)
    return { type: 'partial', lpMult: 1.0, badge: 'PARTIAL x1.0' };
  return { type: 'dissent', lpMult: 0.7, badge: 'DISSENT x0.7' };
}

// ─── Utility: Determine Actual Direction ────────────────────

export function determineActualDirection(
  priceChange: number,
  threshold = 0.001
): Direction {
  if (priceChange > threshold) return 'LONG';
  if (priceChange < -threshold) return 'SHORT';
  return 'NEUTRAL';
}
