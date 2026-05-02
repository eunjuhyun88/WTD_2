import type { JudgeCompositionData } from './types';

interface JudgeLevel {
  label: string;
  val: string;
  color: string;
}

interface JudgeSubmitResult {
  saved?: boolean;
  training_triggered?: boolean;
  count?: number;
}

type Verdict = 'agree' | 'disagree' | null;
type Outcome = 'win' | 'loss' | 'flat' | null;
type Rejudged = 'right' | 'wrong' | null;

/**
 * Composition function for JudgePanel data
 * Bundles judge-related state into a portable, testable contract
 */
export function useJudgeComposition(opts: {
  confluence: any;
  confluenceHistory: any;
  symbol: string;
  timeframe: string;
  confidenceAlpha: string | number;
  judgePlan: JudgeLevel[];
  rrLossPct: string;
  rrGainPct: string;
  judgeVerdict: Verdict;
  judgeOutcome: Outcome;
  judgeRejudged: Rejudged;
  judgeSubmitting: boolean;
  judgeSubmitResult: JudgeSubmitResult | null;
}): JudgeCompositionData {
  return {
    confluence: opts.confluence,
    confluenceHistory: opts.confluenceHistory,
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    confidenceAlpha: opts.confidenceAlpha,
    judgePlan: opts.judgePlan,
    rrLossPct: opts.rrLossPct,
    rrGainPct: opts.rrGainPct,
    judgeVerdict: opts.judgeVerdict,
    judgeOutcome: opts.judgeOutcome,
    judgeRejudged: opts.judgeRejudged,
    judgeSubmitting: opts.judgeSubmitting,
    judgeSubmitResult: opts.judgeSubmitResult,
  };
}
