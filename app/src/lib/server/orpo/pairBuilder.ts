import { query } from '$lib/server/db';
import {
  buildOrpoPromptContract,
  buildOrpoResponseContract,
  hashPromptContract,
  type OrpoPromptContract,
  type OrpoResponseContract,
} from './contextContract';
import { scoreTrajectoryUtility, type UtilityWeights } from './utilityScore';

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

export type PairQuality = 'high' | 'medium' | 'low';

interface DecisionTrajectoryRow {
  trajectory_id: string;
  user_id: string;
  trace_id: string;
  context_features: unknown;
  decision_features: unknown;
  outcome_features: unknown;
  utility_score: number | null;
  label_quality: 'pending' | 'good' | 'bad' | 'ambiguous';
  created_at: string;
}

interface PairCandidate {
  trajectoryId: string;
  traceId: string;
  prompt: OrpoPromptContract;
  promptHash: string;
  response: OrpoResponseContract;
  utility: number;
  p0Violation: boolean;
  featureCompleteness: number;
  createdAt: string;
}

export interface BuiltOrpoPair {
  traceId: string;
  promptHash: string;
  prompt: OrpoPromptContract;
  chosen: OrpoResponseContract;
  rejected: OrpoResponseContract;
  marginScore: number;
  pairQuality: PairQuality;
  metadata: {
    chosenTrajectoryId: string;
    rejectedTrajectoryId: string;
    chosenUtility: number;
    rejectedUtility: number;
    chosenP0Violation: boolean;
    rejectedP0Violation: boolean;
    clusterKey: string;
  };
}

export interface OrpoBuildInput {
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  minMargin?: number;
  maxPairs?: number;
  maxPerCluster?: number;
  includeLowQuality?: boolean;
  utilityWeights?: UtilityWeights;
}

export interface OrpoBuildResult {
  sourceCount: number;
  candidateCount: number;
  clusterCount: number;
  pairCount: number;
  droppedLowMargin: number;
  droppedLowQuality: number;
  minMargin: number;
  avgMargin: number;
  qualityCounts: Record<PairQuality, number>;
  filters: {
    windowStart: string;
    windowEnd: string;
    maxPairs: number;
    maxPerCluster: number;
    includeLowQuality: boolean;
  };
  pairs: BuiltOrpoPair[];
}

function toPairQuality(marginScore: number): PairQuality | null {
  if (marginScore >= 30) return 'high';
  if (marginScore >= 15) return 'medium';
  if (marginScore >= 5) return 'low';
  return null;
}

function estimateFeatureCompleteness(prompt: OrpoPromptContract, response: OrpoResponseContract): number {
  let total = 0;
  let filled = 0;

  const checks: Array<boolean> = [
    prompt.market.pair.length > 0,
    prompt.market.timeframe.length > 0,
    Number.isFinite(prompt.market.price),
    prompt.zone.primary.length > 0,
    Number.isFinite(prompt.entryScore.total),
    Number.isFinite(prompt.riskGate.rr),
    Number.isFinite(response.decision.confidence),
    response.decision.riskPlan.maxPositionPct > 0,
  ];

  total += checks.length;
  filled += checks.filter(Boolean).length;

  const mtfFrames = [prompt.mtf['1H'], prompt.mtf['4H'], prompt.mtf['1D'], prompt.mtf['1W'], prompt.mtf['1M']];
  for (const frame of mtfFrames) {
    total += 3;
    if (frame.bias) filled += 1;
    if (Number.isFinite(frame.rsi14)) filled += 1;
    if (frame.emaTrend) filled += 1;
  }

  return total === 0 ? 0 : filled / total;
}

function toClusterKey(prompt: OrpoPromptContract): string {
  return [
    prompt.market.pair,
    prompt.market.timeframe,
    prompt.zone.primary || 'UNKNOWN',
    prompt.market.regime || 'unknown',
  ].join('|');
}

function toCandidate(row: DecisionTrajectoryRow, utilityWeights?: UtilityWeights): PairCandidate {
  const context = asObject(row.context_features);
  const decision = asObject(row.decision_features);
  const outcome = asObject(row.outcome_features);

  const prompt = buildOrpoPromptContract({
    traceId: row.trace_id,
    contextFeatures: context,
    decisionFeatures: decision,
    asOfIso: row.created_at,
  });

  const response = buildOrpoResponseContract({
    decisionFeatures: decision,
    outcomeFeatures: outcome,
  });

  const scored = scoreTrajectoryUtility(
    {
      decisionFeatures: decision,
      outcomeFeatures: outcome,
      utilityScoreRaw: row.utility_score,
    },
    utilityWeights,
  );

  return {
    trajectoryId: row.trajectory_id,
    traceId: row.trace_id,
    prompt,
    promptHash: hashPromptContract(prompt),
    response,
    utility: scored.utility,
    p0Violation: scored.input.p0Violation,
    featureCompleteness: estimateFeatureCompleteness(prompt, response),
    createdAt: row.created_at,
  };
}

function chooseRejected(sortedDesc: PairCandidate[], chosen: PairCandidate): PairCandidate | null {
  for (let i = sortedDesc.length - 1; i >= 0; i -= 1) {
    const candidate = sortedDesc[i];
    if (candidate.trajectoryId === chosen.trajectoryId) continue;
    if (candidate.traceId === chosen.traceId) continue;
    return candidate;
  }
  return null;
}

function dedupeByPromptHash(pairs: BuiltOrpoPair[]): BuiltOrpoPair[] {
  const seen = new Set<string>();
  const out: BuiltOrpoPair[] = [];
  for (const pair of pairs) {
    const key = `${pair.promptHash}:${pair.metadata.chosenTrajectoryId}:${pair.metadata.rejectedTrajectoryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }
  return out;
}

function buildPairsFromCandidates(candidates: PairCandidate[], input: OrpoBuildInput): OrpoBuildResult {
  const minMargin = Number.isFinite(input.minMargin ?? Number.NaN) ? Math.max(0, Number(input.minMargin)) : 5;
  const maxPairs = Number.isFinite(input.maxPairs ?? Number.NaN) ? Math.max(1, Math.trunc(Number(input.maxPairs))) : 500;
  const maxPerCluster = Number.isFinite(input.maxPerCluster ?? Number.NaN)
    ? Math.max(1, Math.trunc(Number(input.maxPerCluster)))
    : 60;
  const includeLowQuality = input.includeLowQuality ?? false;

  const clusterMap = new Map<string, PairCandidate[]>();
  for (const candidate of candidates) {
    const key = toClusterKey(candidate.prompt);
    const list = clusterMap.get(key);
    if (list) list.push(candidate);
    else clusterMap.set(key, [candidate]);
  }

  const rawPairs: BuiltOrpoPair[] = [];
  let droppedLowMargin = 0;
  let droppedLowQuality = 0;

  for (const [clusterKey, items] of clusterMap.entries()) {
    const sorted = [...items].sort((a, b) => b.utility - a.utility);
    const pickCount = Math.min(maxPerCluster, sorted.length);

    for (let i = 0; i < pickCount; i += 1) {
      if (rawPairs.length >= maxPairs) break;
      const chosen = sorted[i];
      const rejected = chooseRejected(sorted, chosen);
      if (!rejected) continue;

      const marginScore = chosen.utility - rejected.utility;
      if (marginScore < minMargin) {
        droppedLowMargin += 1;
        continue;
      }

      const quality = toPairQuality(marginScore);
      if (!quality) {
        droppedLowMargin += 1;
        continue;
      }
      if (quality === 'low' && !includeLowQuality) {
        droppedLowQuality += 1;
        continue;
      }

      rawPairs.push({
        traceId: chosen.traceId,
        promptHash: chosen.promptHash,
        prompt: chosen.prompt,
        chosen: chosen.response,
        rejected: rejected.response,
        marginScore: Number(marginScore.toFixed(4)),
        pairQuality: quality,
        metadata: {
          chosenTrajectoryId: chosen.trajectoryId,
          rejectedTrajectoryId: rejected.trajectoryId,
          chosenUtility: Number(chosen.utility.toFixed(4)),
          rejectedUtility: Number(rejected.utility.toFixed(4)),
          chosenP0Violation: chosen.p0Violation,
          rejectedP0Violation: rejected.p0Violation,
          clusterKey,
        },
      });
    }

    if (rawPairs.length >= maxPairs) break;
  }

  const pairs = dedupeByPromptHash(rawPairs).sort((a, b) => b.marginScore - a.marginScore).slice(0, maxPairs);

  const qualityCounts: Record<PairQuality, number> = { high: 0, medium: 0, low: 0 };
  let marginSum = 0;
  for (const pair of pairs) {
    qualityCounts[pair.pairQuality] += 1;
    marginSum += pair.marginScore;
  }

  return {
    sourceCount: candidates.length,
    candidateCount: candidates.length,
    clusterCount: clusterMap.size,
    pairCount: pairs.length,
    droppedLowMargin,
    droppedLowQuality,
    minMargin,
    avgMargin: pairs.length > 0 ? Number((marginSum / pairs.length).toFixed(4)) : 0,
    qualityCounts,
    filters: {
      windowStart: input.windowStart.toISOString(),
      windowEnd: input.windowEnd.toISOString(),
      maxPairs,
      maxPerCluster,
      includeLowQuality,
    },
    pairs,
  };
}

async function loadDecisionTrajectories(input: OrpoBuildInput): Promise<DecisionTrajectoryRow[]> {
  const result = await query<DecisionTrajectoryRow>(
    `
      SELECT
        trajectory_id,
        user_id,
        trace_id,
        context_features,
        decision_features,
        outcome_features,
        utility_score,
        label_quality,
        created_at
      FROM decision_trajectories
      WHERE user_id = $1
        AND created_at >= $2::timestamptz
        AND created_at <= $3::timestamptz
      ORDER BY created_at DESC
      LIMIT 15000
    `,
    [input.userId, input.windowStart.toISOString(), input.windowEnd.toISOString()],
  );

  return result.rows;
}

export function buildOrpoPairsFromRows(rows: DecisionTrajectoryRow[], input: OrpoBuildInput): OrpoBuildResult {
  const candidates = rows
    .map((row) => toCandidate(row, input.utilityWeights))
    .filter((candidate) => candidate.featureCompleteness >= 0.45)
    .filter((candidate) => Number.isFinite(candidate.utility));

  return buildPairsFromCandidates(candidates, input);
}

export async function buildOrpoPairs(input: OrpoBuildInput): Promise<OrpoBuildResult> {
  const rows = await loadDecisionTrajectories(input);
  return buildOrpoPairsFromRows(rows, input);
}
