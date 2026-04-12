// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Agent Pipeline (B-03)
// ═══════════════════════════════════════════════════════════════
//
// Arena 매치의 핵심 엔진.
// 1. 드래프트된 3 에이전트 × 선택된 Spec으로 팩터 계산
// 2. Spec 가중치 적용 → AgentOutput (direction, confidence, thesis)
// 3. 드래프트 가중치로 합산 → MatchPrediction (최종 예측)
//
// 외부 의존: factorEngine.ts, agents.ts, specs.ts, types.ts

import type {
  AgentId,
  AgentOutput,
  Direction,
  DraftSelection,
  FactorResult,
  MatchPrediction,
  TrendAnalysis,
  DivergenceSignal,
} from './types';
import { AGENT_POOL, getFactorIds, normalizeAgentId } from './agents';
import { getSpec } from './specs';
import { computeAgentFactors, type MarketContext } from './factorEngine';
import { ANALYSIS_TIMEOUT_MS } from './constants';

// ─── Types ───────────────────────────────────────────────────

export interface PipelineInput {
  draft: DraftSelection[];
  marketContext: MarketContext;
  userId?: string;
  matchId?: string;
}

export interface PipelineResult {
  agentOutputs: AgentOutput[];
  prediction: MatchPrediction;
  meta: {
    totalLatencyMs: number;
    factorsComputed: number;
    factorsAvailable: number;
    dataCompleteness: number;  // 0-1
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toDirection(score: number, threshold = 8): Direction {
  if (score > threshold) return 'LONG';
  if (score < -threshold) return 'SHORT';
  return 'NEUTRAL';
}

function generateThesis(
  agentId: AgentId,
  direction: Direction,
  confidence: number,
  factors: FactorResult[],
  specName: string
): string {
  const agent = AGENT_POOL[agentId];
  const topFactors = [...factors]
    .filter(f => Math.abs(f.value) > 10)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 3);

  const factorSummary = topFactors.length > 0
    ? topFactors.map(f => `${f.factorId}(${f.value > 0 ? '+' : ''}${f.value})`).join(', ')
    : 'no strong signals';

  return `${agent.name} [${specName}] → ${direction} ${confidence}% · Key: ${factorSummary}`;
}

// ─── Single Agent Scoring ────────────────────────────────────

function scoreAgent(
  selection: DraftSelection,
  ctx: MarketContext
): AgentOutput {
  const startMs = performance.now();
  const agentId = normalizeAgentId(selection.agentId);
  const factorIds = getFactorIds(agentId);
  const spec = getSpec(agentId, selection.specId);

  // Spec 없으면 균등 가중치 폴백
  const weights = spec?.weights ?? Object.fromEntries(factorIds.map(id => [id, 1 / factorIds.length]));
  const specName = spec?.name ?? 'Unknown';

  // 모든 팩터 계산
  const factors = computeAgentFactors(factorIds, ctx);

  // 가중 합산
  let bullScore = 0;
  let bearScore = 0;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const factor of factors) {
    const w = weights[factor.factorId] ?? 0;
    const contribution = factor.value * w;
    weightedSum += contribution;
    totalWeight += w;

    if (factor.value > 0) bullScore += factor.value * w;
    else bearScore += Math.abs(factor.value) * w;
  }

  // 정규화: 가중 합산은 -100~+100 범위
  const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Direction 결정
  const direction = toDirection(normalizedScore, 8);

  // Confidence: base 50 + |score| 스케일링, 45-95 범위
  const rawConf = 50 + Math.abs(normalizedScore) * 0.45;
  const confidence = Math.round(clamp(rawConf, 45, 95));

  // Trend context 수집
  const trendContext: Record<string, TrendAnalysis> = {};
  const divergences: DivergenceSignal[] = [];
  for (const f of factors) {
    if (f.trend) trendContext[f.factorId] = f.trend;
    if (f.divergence && f.divergence.type !== 'NONE') divergences.push(f.divergence);
  }

  const latencyMs = Math.round(performance.now() - startMs);

  return {
    agentId,
    specId: selection.specId,
    direction,
    confidence,
    thesis: generateThesis(agentId, direction, confidence, factors, specName),
    factors,
    bullScore: Math.round(bullScore),
    bearScore: Math.round(bearScore),
    trendContext: Object.keys(trendContext).length > 0 ? trendContext : undefined,
    divergences: divergences.length > 0 ? divergences : undefined,
    latencyMs,
  };
}

// ─── Final Prediction (3 에이전트 합산) ──────────────────────

function computeFinalPrediction(
  outputs: AgentOutput[],
  draft: DraftSelection[]
): MatchPrediction {
  if (outputs.length === 0) {
    return {
      direction: 'NEUTRAL',
      confidence: 50,
      isOverride: false,
      reasonTags: ['no_agents'],
    };
  }

  // 드래프트 가중치 매핑
  const weightMap = new Map(draft.map(d => [d.agentId, d.weight]));
  const totalWeight = draft.reduce((s, d) => s + d.weight, 0) || 100;

  // 방향별 가중 점수
  let longScore = 0;
  let shortScore = 0;
  let neutralScore = 0;
  let weightedConfidence = 0;

  for (const output of outputs) {
    const w = (weightMap.get(output.agentId) ?? 0) / totalWeight;

    if (output.direction === 'LONG') longScore += w * output.confidence;
    else if (output.direction === 'SHORT') shortScore += w * output.confidence;
    else neutralScore += w * output.confidence;

    weightedConfidence += w * output.confidence;
  }

  // 최종 방향: 가중 점수 기반
  let direction: Direction;
  const spread = Math.abs(longScore - shortScore);

  if (spread < 5) {
    direction = 'NEUTRAL';
  } else if (longScore > shortScore) {
    direction = 'LONG';
  } else {
    direction = 'SHORT';
  }

  // Confidence: 가중 평균 + spread 보정
  const baseConf = Math.round(weightedConfidence);
  const spreadBonus = Math.min(spread * 0.2, 10);
  const confidence = Math.round(clamp(baseConf + (direction !== 'NEUTRAL' ? spreadBonus : -5), 40, 95));

  // Reason tags
  const reasonTags: string[] = [];
  const agentDirs = outputs.map(o => o.direction);
  const allSame = agentDirs.every(d => d === agentDirs[0]);
  if (allSame && agentDirs[0] !== 'NEUTRAL') reasonTags.push('unanimous');
  if (spread > 30) reasonTags.push('strong_consensus');
  if (spread < 10 && direction !== 'NEUTRAL') reasonTags.push('weak_consensus');
  if (outputs.some(o => o.divergences && o.divergences.length > 0)) reasonTags.push('divergence_detected');

  return {
    direction,
    confidence,
    isOverride: false,
    reasonTags,
  };
}

// ─── Main Pipeline ───────────────────────────────────────────

export async function runAgentPipeline(input: PipelineInput): Promise<PipelineResult> {
  const startMs = performance.now();

  // 에이전트 병렬 처리 (timeout 포함)
  const agentOutputs: AgentOutput[] = [];

  const results = await Promise.allSettled(
    input.draft.map(selection =>
      Promise.race([
        Promise.resolve(scoreAgent(selection, input.marketContext)),
        new Promise<AgentOutput>((_, reject) =>
          setTimeout(() => reject(new Error('Agent timeout')), ANALYSIS_TIMEOUT_MS)
        ),
      ])
    )
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      agentOutputs.push(result.value);
    } else {
      // Timeout/error → 중립 폴백
      const sel = input.draft[i];
      agentOutputs.push({
        agentId: sel.agentId,
        specId: sel.specId,
        direction: 'NEUTRAL',
        confidence: 45,
        thesis: `${sel.agentId} timed out or errored — defaulting to neutral.`,
        factors: [],
        bullScore: 0,
        bearScore: 0,
        latencyMs: ANALYSIS_TIMEOUT_MS,
      });
    }
  }

  // 최종 예측
  const prediction = computeFinalPrediction(agentOutputs, input.draft);

  // 메타데이터
  const allFactors = agentOutputs.flatMap(o => o.factors);
  const availableFactors = allFactors.filter(f => f.value !== 0 || !f.detail.includes('unavailable'));
  const totalLatencyMs = Math.round(performance.now() - startMs);

  return {
    agentOutputs,
    prediction,
    meta: {
      totalLatencyMs,
      factorsComputed: allFactors.length,
      factorsAvailable: availableFactors.length,
      dataCompleteness: allFactors.length > 0
        ? Math.round((availableFactors.length / allFactors.length) * 100) / 100
        : 0,
    },
  };
}

// ─── Convenience: Quick Pipeline (기본 드래프트) ─────────────

export async function runQuickPipeline(ctx: MarketContext): Promise<PipelineResult> {
  const defaultDraft: DraftSelection[] = [
    { agentId: 'STRUCTURE', specId: 'structure_base', weight: 40 },
    { agentId: 'DERIV',     specId: 'deriv_base',     weight: 35 },
    { agentId: 'SENTI',     specId: 'senti_base',     weight: 25 },
  ];

  return runAgentPipeline({ draft: defaultDraft, marketContext: ctx });
}
