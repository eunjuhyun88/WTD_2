import { calculateHelpfulness } from './qualityGate';
import { getIntelThresholds } from './thresholds';

export interface BacktestSummary {
  baselineWinRatePct: number;
  policyWinRatePct: number;
  baselineSharpe: number;
  policySharpe: number;
  baselineMaxDrawdownPct: number;
  policyMaxDrawdownPct: number;
  sampleSize: number;
  windowMonths?: number;
}

export interface RuntimeFeedback {
  positivePct: number;
  applyRatePct: number;
}

export interface BacktestImpact {
  winRateLiftPct: number;
  sharpeLift: number;
  maxDrawdownReductionPct: number;
  meetsTarget: boolean;
  reasons: string[];
}

export interface HelpfulnessEvaluation {
  score: number;
  impact: BacktestImpact;
  feedback: RuntimeFeedback;
  meetsTarget: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function evaluateBacktestImpact(summary: BacktestSummary): BacktestImpact {
  const thresholds = getIntelThresholds();
  const targets = thresholds.backtestTargets;

  const winRateLiftPct = round2(summary.policyWinRatePct - summary.baselineWinRatePct);
  const sharpeLift = round2(summary.policySharpe - summary.baselineSharpe);
  const maxDrawdownReductionPct = round2(summary.baselineMaxDrawdownPct - summary.policyMaxDrawdownPct);

  const reasons: string[] = [];
  if (winRateLiftPct < targets.winRateLiftPct) reasons.push('win_rate_lift_below_target');
  if (sharpeLift < targets.sharpeLift) reasons.push('sharpe_lift_below_target');
  if (maxDrawdownReductionPct < targets.maxDrawdownReductionPct) reasons.push('drawdown_reduction_below_target');
  if (summary.sampleSize < 200) reasons.push('sample_size_low');

  return {
    winRateLiftPct,
    sharpeLift,
    maxDrawdownReductionPct,
    meetsTarget: reasons.length === 0,
    reasons,
  };
}

export async function evaluateHelpfulness(
  summary: BacktestSummary,
  feedback: RuntimeFeedback,
): Promise<HelpfulnessEvaluation> {
  const impact = evaluateBacktestImpact(summary);

  const score = calculateHelpfulness({
    backtestWinRateLiftPct: impact.winRateLiftPct,
    feedbackPositivePct: feedback.positivePct,
    applyRatePct: feedback.applyRatePct,
    pnlLiftPct: impact.maxDrawdownReductionPct / 3,
  });

  return {
    score,
    impact,
    feedback,
    meetsTarget: impact.meetsTarget,
  };
}

export function estimateNpsPositiveRate(positiveVotes: number, totalVotes: number): number {
  if (!Number.isFinite(totalVotes) || totalVotes <= 0) return 0;
  const ratio = (Math.max(0, positiveVotes) / totalVotes) * 100;
  return round2(Math.max(0, Math.min(100, ratio)));
}
