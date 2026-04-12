import { getIntelThresholds } from './thresholds';
import type {
  DecisionBias,
  DecisionContext,
  DecisionEvidence,
  DomainScoreBreakdown,
  IntelDecisionOutput,
  QualityGateResult,
} from './types';

export interface EngineEvidence extends DecisionEvidence {
  gate?: QualityGateResult;
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function freshnessFactor(maxAgeSec: number, freshnessSec: number): number {
  if (maxAgeSec <= 0) return 0;
  const age = Math.max(0, freshnessSec);
  if (age >= maxAgeSec) return 0;
  return 1 - age / maxAgeSec;
}

function softmax(input: number[]): number[] {
  if (input.length === 0) return [];
  const max = Math.max(...input);
  const exps = input.map((value) => Math.exp(value - max));
  const sum = exps.reduce((acc, value) => acc + value, 0);
  if (!Number.isFinite(sum) || sum <= 0) return input.map(() => 1 / input.length);
  return exps.map((value) => value / sum);
}

function defaultReason(reason: string, domain: string): string {
  const trimmed = reason.trim();
  return trimmed ? trimmed : `${domain} evidence`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v.trim().length > 0)));
}

export function computeDecision(
  evidenceList: EngineEvidence[],
  context: DecisionContext = {},
): IntelDecisionOutput {
  const thresholds = getIntelThresholds();
  const blockers: string[] = [];

  if (evidenceList.length === 0) {
    return {
      bias: 'wait',
      confidence: 100,
      shouldTrade: false,
      qualityGateScore: 0,
      longScore: 0,
      shortScore: 0,
      waitScore: 100,
      netEdge: 0,
      edgePct: 0,
      coveragePct: 0,
      reasons: [],
      blockers: ['no_evidence'],
      policyVersion: thresholds.policyVersion,
      breakdown: [],
    };
  }

  const domainWeightTotal = Object.values(thresholds.domainWeights).reduce((acc, value) => acc + value, 0);
  const domainCoverage = new Set<string>();
  const qualitySamples: number[] = [];
  const helpfulnessSamples: number[] = [];

  let longScore = 0;
  let shortScore = 0;
  let waitScore = 0;

  const breakdown: DomainScoreBreakdown[] = [];

  for (const evidence of evidenceList) {
    const domainWeight = thresholds.domainWeights[evidence.domain];
    const maxAgeSec = thresholds.maxSignalAgeSec[evidence.domain];
    const freshness = freshnessFactor(maxAgeSec, evidence.freshnessSec);

    if (!Number.isFinite(domainWeight) || domainWeight <= 0) continue;

    if (evidence.gate?.visibility === 'hidden') {
      blockers.push(`${evidence.domain}_hidden_by_gate`);
      breakdown.push({
        domain: evidence.domain,
        weightedLong: 0,
        weightedShort: 0,
        weightedWait: 0,
        qualityScore: evidence.gate.weightedScore,
        helpfulnessScore: evidence.gate.scores.helpfulness,
        reason: defaultReason(evidence.reason, evidence.domain),
      });
      continue;
    }

    const qualityScore = clamp(evidence.qualityScore ?? evidence.gate?.weightedScore ?? thresholds.qualityGate.passThreshold);
    const helpfulnessScore = clamp(
      evidence.helpfulnessScore ??
        evidence.gate?.scores.helpfulness ??
        thresholds.qualityGate.minimum.helpfulness,
    );

    qualitySamples.push(qualityScore);
    helpfulnessSamples.push(helpfulnessScore);

    const strength = clamp(evidence.biasStrength) / 100;
    const confidence = clamp(evidence.confidence) / 100;
    const qualityFactor = qualityScore / 100;
    const helpfulnessFactor = helpfulnessScore / 100;

    const baseContribution = strength * confidence * freshness * qualityFactor * helpfulnessFactor * domainWeight * 100;
    let weightedLong = 0;
    let weightedShort = 0;
    let weightedWait = domainWeight * (1 - confidence) * 30;

    if (evidence.bias === 'long') weightedLong = baseContribution;
    else if (evidence.bias === 'short') weightedShort = baseContribution;
    else weightedWait += baseContribution;

    longScore += weightedLong;
    shortScore += weightedShort;
    waitScore += weightedWait;

    if (qualityScore > 0) domainCoverage.add(evidence.domain);

    breakdown.push({
      domain: evidence.domain,
      weightedLong: round2(weightedLong),
      weightedShort: round2(weightedShort),
      weightedWait: round2(weightedWait),
      qualityScore: round2(qualityScore),
      helpfulnessScore: round2(helpfulnessScore),
      reason: defaultReason(evidence.reason, evidence.domain),
    });
  }

  const avgHelpfulness =
    helpfulnessSamples.length > 0
      ? helpfulnessSamples.reduce((acc, value) => acc + value, 0) / helpfulnessSamples.length
      : thresholds.qualityGate.minimum.helpfulness;

  const helpfulnessOverlay = clamp(avgHelpfulness) / 100;
  longScore *= helpfulnessOverlay;
  shortScore *= helpfulnessOverlay;

  const preConflictLead = Math.max(longScore, shortScore, 1e-6);
  let edgePct = (Math.abs(longScore - shortScore) / preConflictLead) * 100;
  if (edgePct < thresholds.conflict.edgeBandPct && longScore > 0 && shortScore > 0) {
    const penaltyFactor = Math.max(0, (100 - thresholds.conflict.confidencePenaltyPct) / 100);
    longScore *= penaltyFactor;
    shortScore *= penaltyFactor;
    waitScore += thresholds.conflict.waitPrior * 100;
    blockers.push('conflict_penalty_applied');
  }

  const netEdge = longScore - shortScore;
  const absEdge = Math.abs(netEdge);
  edgePct = (absEdge / Math.max(longScore, shortScore, 1e-6)) * 100;

  const inferredCoveragePct =
    domainWeightTotal > 0
      ? (Array.from(domainCoverage).reduce((acc, domain) => acc + thresholds.domainWeights[domain as keyof typeof thresholds.domainWeights], 0) /
          domainWeightTotal) *
        100
      : 0;

  const coveragePct =
    Number.isFinite(context.coveragePct) && (context.coveragePct ?? 0) >= 0
      ? Number(context.coveragePct)
      : inferredCoveragePct;

  const backtestWinRatePct =
    Number.isFinite(context.backtestWinRatePct) && context.backtestWinRatePct != null
      ? Number(context.backtestWinRatePct)
      : 100;

  const volatilityIndex =
    Number.isFinite(context.volatilityIndex) && context.volatilityIndex != null
      ? Number(context.volatilityIndex)
      : null;

  if (coveragePct < thresholds.noTrade.minCoveragePct) blockers.push('coverage_low');
  if (backtestWinRatePct < thresholds.noTrade.minBacktestWinRatePct) blockers.push('backtest_win_rate_low');
  if (volatilityIndex != null && volatilityIndex > thresholds.noTrade.maxVolatilityIndex) blockers.push('volatility_too_high');
  if (absEdge < thresholds.noTrade.minEdgeToTrade) blockers.push('edge_below_threshold');

  const probs = softmax([longScore, shortScore, waitScore]);
  const noTradeTriggered = blockers.some((blocker) =>
    blocker === 'coverage_low' ||
    blocker === 'backtest_win_rate_low' ||
    blocker === 'volatility_too_high' ||
    blocker === 'edge_below_threshold' ||
    blocker.endsWith('_hidden_by_gate'),
  );

  let bias: DecisionBias = 'wait';
  if (!noTradeTriggered) {
    if (longScore >= shortScore && longScore >= waitScore) bias = 'long';
    else if (shortScore > longScore && shortScore >= waitScore) bias = 'short';
    else bias = 'wait';
  }

  if (bias === 'wait') waitScore = Math.max(waitScore, 100 * thresholds.conflict.waitPrior);

  const confidenceByBias =
    bias === 'long'
      ? probs[0]
      : bias === 'short'
        ? probs[1]
        : probs[2];

  const qualityGateScore =
    qualitySamples.length > 0
      ? qualitySamples.reduce((acc, value) => acc + value, 0) / qualitySamples.length
      : 0;

  const rankedReasons = breakdown
    .slice()
    .sort((a, b) => Math.max(b.weightedLong, b.weightedShort, b.weightedWait) - Math.max(a.weightedLong, a.weightedShort, a.weightedWait))
    .map((item) => item.reason);

  return {
    bias,
    confidence: round2(clamp(confidenceByBias * 100)),
    shouldTrade: bias !== 'wait',
    qualityGateScore: round2(qualityGateScore),
    longScore: round2(longScore),
    shortScore: round2(shortScore),
    waitScore: round2(waitScore),
    netEdge: round2(netEdge),
    edgePct: round2(edgePct),
    coveragePct: round2(clamp(coveragePct)),
    reasons: uniqueStrings(rankedReasons).slice(0, 3),
    blockers: uniqueStrings(blockers),
    policyVersion: thresholds.policyVersion,
    breakdown,
  };
}
