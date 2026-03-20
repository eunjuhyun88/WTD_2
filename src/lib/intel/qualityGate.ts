import { recordGateLog } from './gateLogs';
import { getIntelThresholds } from './thresholds';
import type {
  ManipulationRiskLevel,
  QualityGateResult,
  QualityGateScores,
} from './types';

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ActionabilityInput {
  actionTypeCount: number;
  clarityScore: number;
}

export interface TimelinessInput {
  delayMinutes: number;
  horizonMinutes?: number;
}

export interface ReliabilityInput {
  sourceReliability: number;
  failureRatePct: number;
  manipulationRisk: ManipulationRiskLevel;
}

export interface RelevanceInput {
  pairKeywordMatchPct: number;
  timeframeAligned: boolean;
}

export interface HelpfulnessInput {
  backtestWinRateLiftPct: number;
  feedbackPositivePct: number;
  applyRatePct: number;
  pnlLiftPct?: number;
}

export interface QualityGateFeatureInput {
  actionability: ActionabilityInput;
  timeliness: TimelinessInput;
  reliability: ReliabilityInput;
  relevance: RelevanceInput;
  helpfulness: HelpfulnessInput;
}

export function calculateActionability(input: ActionabilityInput): number {
  const actionCount = Math.max(0, Math.floor(input.actionTypeCount));
  const clarity = clamp(input.clarityScore, 0, 40);
  return clamp(actionCount * 20 + clarity);
}

export function calculateTimeliness(input: TimelinessInput): number {
  const horizon = Number.isFinite(input.horizonMinutes) && (input.horizonMinutes ?? 0) > 0
    ? Number(input.horizonMinutes)
    : 120;
  const delay = Math.max(0, input.delayMinutes);
  return clamp(((horizon - delay) / horizon) * 100);
}

const RISK_ADJUSTMENT: Record<ManipulationRiskLevel, number> = {
  low: 20,
  medium: 0,
  high: -20,
};

export function calculateReliability(input: ReliabilityInput): number {
  const reliability = clamp(input.sourceReliability);
  const failurePenalty = Math.max(0, input.failureRatePct);
  const riskAdjust = RISK_ADJUSTMENT[input.manipulationRisk] ?? 0;
  return clamp(reliability - failurePenalty + riskAdjust);
}

export function calculateRelevance(input: RelevanceInput): number {
  const keywordMatch = clamp(input.pairKeywordMatchPct);
  const timeframeBonus = input.timeframeAligned ? 20 : 0;
  return clamp(keywordMatch + timeframeBonus);
}

export function calculateHelpfulness(input: HelpfulnessInput): number {
  const winRateContribution = Math.max(0, input.backtestWinRateLiftPct) * 10;
  const feedbackContribution = clamp(input.feedbackPositivePct) * 0.5;
  const applyContribution = clamp(input.applyRatePct) * 0.1;
  const pnlContribution = Math.max(0, input.pnlLiftPct ?? 0) * 4;
  return clamp(winRateContribution + feedbackContribution + applyContribution + pnlContribution);
}

export function scoreQualityGate(input: QualityGateFeatureInput): QualityGateScores {
  return {
    actionability: calculateActionability(input.actionability),
    timeliness: calculateTimeliness(input.timeliness),
    reliability: calculateReliability(input.reliability),
    relevance: calculateRelevance(input.relevance),
    helpfulness: calculateHelpfulness(input.helpfulness),
  };
}

export function evaluateQualityGate(
  scoresInput: Partial<QualityGateScores> & Pick<QualityGateScores, 'actionability' | 'timeliness' | 'reliability' | 'relevance'>,
  source = 'unknown',
): QualityGateResult {
  const thresholds = getIntelThresholds();
  const scores: QualityGateScores = {
    actionability: clamp(scoresInput.actionability),
    timeliness: clamp(scoresInput.timeliness),
    reliability: clamp(scoresInput.reliability),
    relevance: clamp(scoresInput.relevance),
    helpfulness: clamp(scoresInput.helpfulness ?? thresholds.qualityGate.minimum.helpfulness),
  };

  const weights = thresholds.qualityGate.weights;
  const minimum = thresholds.qualityGate.minimum;

  const weightedScore = round2(
    scores.actionability * weights.actionability +
      scores.timeliness * weights.timeliness +
      scores.reliability * weights.reliability +
      scores.relevance * weights.relevance +
      scores.helpfulness * weights.helpfulness,
  );

  const blockers: string[] = [];

  if (scores.actionability < minimum.actionability) blockers.push('actionability_low');
  if (scores.timeliness < minimum.timeliness) blockers.push('timeliness_low');
  if (scores.reliability < minimum.reliability) blockers.push('reliability_low');
  if (scores.relevance < minimum.relevance) blockers.push('relevance_low');
  if (scores.helpfulness < minimum.helpfulness) blockers.push('helpfulness_low');

  let pass = false;
  let visibility: QualityGateResult['visibility'] = 'hidden';

  if (scores.helpfulness < thresholds.qualityGate.hardHideHelpfulnessBelow) {
    blockers.push('helpfulness_hard_hide');
  } else if (blockers.length === 0 && weightedScore >= thresholds.qualityGate.passThreshold) {
    pass = true;
    visibility = 'full';
  } else if (blockers.length === 0) {
    visibility = 'low_impact';
    blockers.push('weighted_score_low');
  }

  if (!pass) {
    recordGateLog({
      source,
      visibility,
      weightedScore,
      blockers,
      scores,
    });
  }

  return {
    scores,
    weightedScore,
    pass,
    visibility,
    blockers,
  };
}

export function evaluateQualityGateFromFeatures(
  input: QualityGateFeatureInput,
  source = 'unknown',
): QualityGateResult {
  return evaluateQualityGate(scoreQualityGate(input), source);
}
