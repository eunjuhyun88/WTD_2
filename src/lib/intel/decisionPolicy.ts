import { computeDecision } from './decisionEngine';
import {
  calculateActionability,
  calculateHelpfulness,
  calculateRelevance,
  calculateReliability,
  calculateTimeliness,
  evaluateQualityGate as evaluateQualityGateV3,
  evaluateQualityGateFromFeatures,
  scoreQualityGate,
} from './qualityGate';
import { getIntelThresholds, patchIntelThresholds, resetIntelThresholds, setIntelThresholds } from './thresholds';
import type { DecisionContext, DecisionEvidence, IntelDecisionOutput, QualityGateResult, QualityGateScores } from './types';

export type {
  DecisionBias,
  DecisionContext,
  DecisionEvidence,
  DomainScoreBreakdown,
  EvidenceDomain,
  GateVisibility,
  IntelCardNarrative,
  IntelDecisionOutput,
  ManipulationRiskLevel,
  QualityGateResult,
  QualityGateScores,
} from './types';

export { evaluateBacktestImpact, evaluateHelpfulness, estimateNpsPositiveRate } from './helpfulnessEvaluator';
export { clearGateLogs, listGateLogs, recordGateLog } from './gateLogs';
export {
  calculateActionability,
  calculateHelpfulness,
  calculateRelevance,
  calculateReliability,
  calculateTimeliness,
  evaluateQualityGateFromFeatures,
  scoreQualityGate,
};
export { getIntelThresholds, patchIntelThresholds, resetIntelThresholds, setIntelThresholds };

export function evaluateQualityGate(
  scores: Omit<QualityGateScores, 'helpfulness'> & Partial<Pick<QualityGateScores, 'helpfulness'>>,
  source = 'intel-policy-v3',
): QualityGateResult {
  const thresholds = getIntelThresholds();
  return evaluateQualityGateV3(
    {
      ...scores,
      helpfulness: scores.helpfulness ?? thresholds.qualityGate.minimum.helpfulness,
    },
    source,
  );
}

export function computeIntelDecision(
  gate: QualityGateResult,
  evidenceList: DecisionEvidence[],
  context: DecisionContext = {},
): IntelDecisionOutput {
  const enrichedEvidence = evidenceList.map((evidence) => ({
    ...evidence,
    gate,
    qualityScore: evidence.qualityScore ?? gate.weightedScore,
    helpfulnessScore: evidence.helpfulnessScore ?? gate.scores.helpfulness,
  }));

  return computeDecision(enrichedEvidence, context);
}
