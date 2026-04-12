export type DecisionBias = 'long' | 'short' | 'wait';

export type EvidenceDomain =
  | 'headlines'
  | 'events'
  | 'flow'
  | 'derivatives'
  | 'trending'
  | 'positions';

export type GateVisibility = 'full' | 'low_impact' | 'hidden';

export type ManipulationRiskLevel = 'low' | 'medium' | 'high';

export interface QualityGateScores {
  actionability: number;
  timeliness: number;
  reliability: number;
  relevance: number;
  helpfulness: number;
}

export interface QualityGateResult {
  scores: QualityGateScores;
  weightedScore: number;
  pass: boolean;
  visibility: GateVisibility;
  blockers: string[];
}

export interface DecisionEvidence {
  domain: EvidenceDomain;
  bias: DecisionBias;
  biasStrength: number; // 0..100
  confidence: number; // 0..100
  freshnessSec: number;
  reason: string;
  helpfulnessScore?: number;
  qualityScore?: number;
}

export interface DecisionContext {
  coveragePct?: number;
  backtestWinRatePct?: number;
  volatilityIndex?: number | null;
}

export interface DomainScoreBreakdown {
  domain: EvidenceDomain;
  weightedLong: number;
  weightedShort: number;
  weightedWait: number;
  qualityScore: number;
  helpfulnessScore: number;
  reason: string;
}

export interface IntelDecisionOutput {
  bias: DecisionBias;
  confidence: number;
  shouldTrade: boolean;
  qualityGateScore: number;
  longScore: number;
  shortScore: number;
  waitScore: number;
  netEdge: number;
  edgePct: number;
  coveragePct: number;
  reasons: string[];
  blockers: string[];
  policyVersion: string;
  breakdown: DomainScoreBreakdown[];
}

export interface IntelCardNarrative {
  what: string;
  soWhat: string;
  nowWhat: string;
  why: string;
  helpScore: number;
  visualAid: string | null;
}
