function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Number(parsed) : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'hit', 'win'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'miss', 'lose'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeConfidence(raw: unknown, fallback = 0.5): number {
  const value = toNumber(raw, fallback);
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
}

export interface UtilityWeights {
  pnl: number;
  drawdown: number;
  ruleViolation: number;
  directionHit: number;
  slippage: number;
  p0Penalty: number;
  overconfidenceScale: number;
}

export const DEFAULT_UTILITY_WEIGHTS: UtilityWeights = {
  pnl: 1.0,
  drawdown: 1.5,
  ruleViolation: 2.0,
  directionHit: 0.6,
  slippage: 0.3,
  p0Penalty: 100,
  overconfidenceScale: 20,
};

export interface UtilityInput {
  pnlBps: number;
  maxDrawdownBps: number;
  ruleViolationCount: number;
  directionHit: number;
  slippageBps: number;
  p0Violation: boolean;
  confidence: number;
  realizedQuality: number;
  baseUtility: number | null;
}

export interface UtilityResult {
  utility: number;
  rawUtility: number;
  p0PenaltyApplied: number;
  overconfidencePenalty: number;
  input: UtilityInput;
}

export interface ScoreTrajectoryInput {
  decisionFeatures: unknown;
  outcomeFeatures: unknown;
  utilityScoreRaw?: number | null;
}

export function extractUtilityInput(input: ScoreTrajectoryInput): UtilityInput {
  const decision = asObject(input.decisionFeatures);
  const outcome = asObject(input.outcomeFeatures);
  const risk = asObject(decision.riskPlan);

  const pnlBps = toNumber(outcome.pnlBps ?? outcome.pnl_bps ?? outcome.closePnlBps ?? outcome.close_pnl_bps, 0);
  const maxDrawdownBps = toNumber(
    outcome.maxDrawdownBps ?? outcome.max_drawdown_bps ?? outcome.drawdownBps ?? outcome.drawdown_bps,
    0,
  );

  const slippageBps = toNumber(outcome.slippageBps ?? outcome.slippage_bps, 0);

  const violationCount = Math.max(
    0,
    Math.trunc(
      toNumber(
        outcome.ruleViolationCount ??
          outcome.rule_violation_count ??
          decision.ruleViolationCount ??
          (Array.isArray(decision.ruleViolations) ? decision.ruleViolations.length : 0),
        0,
      ),
    ),
  );

  const directionHit = toBoolean(outcome.directionHit ?? outcome.direction_hit, false) ? 1 : 0;

  const p0Violation = toBoolean(
    decision.p0Violation ?? outcome.p0Violation ?? outcome.p0_violation ?? (Array.isArray(decision.ruleViolations) && decision.ruleViolations.some((v) => String(v).startsWith('P0_'))),
    false,
  );

  const confidence = normalizeConfidence(decision.confidence, 0.5);
  const realizedQuality = normalizeConfidence(
    outcome.realizedQuality ?? outcome.realized_quality ?? directionHit,
    directionHit,
  );

  return {
    pnlBps,
    maxDrawdownBps,
    ruleViolationCount: violationCount,
    directionHit,
    slippageBps,
    p0Violation,
    confidence,
    realizedQuality,
    baseUtility: Number.isFinite(input.utilityScoreRaw ?? Number.NaN) ? Number(input.utilityScoreRaw) : null,
  };
}

export function computePolicyUtility(
  input: UtilityInput,
  weights: UtilityWeights = DEFAULT_UTILITY_WEIGHTS,
): UtilityResult {
  const rawUtility =
    input.pnlBps * weights.pnl -
    input.maxDrawdownBps * weights.drawdown -
    input.ruleViolationCount * weights.ruleViolation +
    input.directionHit * weights.directionHit -
    input.slippageBps * weights.slippage;

  const overconfidencePenalty = Math.abs(input.confidence - input.realizedQuality) * 100 * weights.overconfidenceScale;
  const p0PenaltyApplied = input.p0Violation ? weights.p0Penalty : 0;

  const computedUtility = rawUtility - p0PenaltyApplied - overconfidencePenalty;
  const utility = input.baseUtility == null ? computedUtility : (computedUtility * 0.6 + input.baseUtility * 0.4);

  return {
    utility,
    rawUtility,
    p0PenaltyApplied,
    overconfidencePenalty,
    input,
  };
}

export function scoreTrajectoryUtility(
  input: ScoreTrajectoryInput,
  weights: UtilityWeights = DEFAULT_UTILITY_WEIGHTS,
): UtilityResult {
  const extracted = extractUtilityInput(input);
  return computePolicyUtility(extracted, weights);
}
