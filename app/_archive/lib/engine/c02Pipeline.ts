// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — C02 Pipeline Wrapper
// ═══════════════════════════════════════════════════════════════
//
// Wraps the existing 8-agent pipeline into the C02 architecture:
//   Layer 0 — ORPO: OFFENSE agents (STRUCTURE + VPA + ICT) → single direction
//   Layer 1 — CTX:  DEFENSE + CONTEXT agents → 4 beliefs (RED/GREEN/NEUTRAL)
//   Layer 2 — GUARDIAN: P0 hard rules (RSI≥95, R:R<1.5, data down)
//   Layer 3 — COMMANDER: Resolves ORPO vs CTX conflict (LLM only if needed)
//
// The existing agentPipeline.ts is NOT replaced — C02 wraps it.

import type {
  AgentOutput,
  Direction,
  FactorResult,
  OrpoOutput,
  CtxAgentId,
  CtxFlag,
  CtxBelief,
  CommanderVerdict,
  GuardianViolation,
  GuardianCheck,
  C02Result,
  DraftSelection,
} from './types';
import type { RAGRecall } from './arenaWarTypes';
import { runAgentPipeline, type PipelineResult, type PipelineInput } from './agentPipeline';
import type { MarketContext } from './factorEngine';
import {
  buildFewShotExamples,
  buildCommanderMessages,
  parseCommanderResponse,
} from './fewShotBuilder';
import type { SimilarGame } from '$lib/server/ragService';

// ─── Constants ──────────────────────────────────────────────

/** OFFENSE agents that feed into ORPO */
const OFFENSE_AGENTS = ['STRUCTURE', 'VPA', 'ICT'] as const;

/** Agent ID → CTX mapping */
const CTX_AGENT_MAP: Record<string, CtxAgentId> = {
  DERIV: 'DERIV',
  FLOW: 'FLOW',
  SENTI: 'SENTI',
  MACRO: 'MACRO',
};

/** P0 Guardian rules */
const P0_RSI_BLOCK = 95;
const P0_RR_MIN = 1.5;

// ─── ORPO: Layer 0 ─────────────────────────────────────────

/**
 * Synthesize OFFENSE agents into a single ORPO output.
 * Uses weighted voting from STRUCTURE, VPA, and ICT.
 */
function buildOrpo(offenseOutputs: AgentOutput[]): OrpoOutput {
  if (offenseOutputs.length === 0) {
    return {
      direction: 'NEUTRAL',
      confidence: 50,
      pattern: 'NO_DATA',
      keyLevels: { support: 0, resistance: 0 },
      factors: [],
      thesis: 'No offense agents produced output.',
    };
  }

  // Weighted vote — STRUCTURE gets slightly more weight
  const weights: Record<string, number> = {
    STRUCTURE: 0.40,
    VPA: 0.35,
    ICT: 0.25,
  };

  let longScore = 0;
  let shortScore = 0;
  let totalConf = 0;
  let totalWeight = 0;
  const allFactors: FactorResult[] = [];
  const thesisParts: string[] = [];

  for (const output of offenseOutputs) {
    const w = weights[output.agentId] ?? 0.33;
    totalWeight += w;
    totalConf += output.confidence * w;

    if (output.direction === 'LONG') longScore += w * output.confidence;
    else if (output.direction === 'SHORT') shortScore += w * output.confidence;

    allFactors.push(...output.factors);
    thesisParts.push(`${output.agentId}: ${output.direction} ${output.confidence}%`);
  }

  // Direction from weighted vote
  const spread = Math.abs(longScore - shortScore);
  let direction: Direction;
  if (spread < 5) direction = 'NEUTRAL';
  else if (longScore > shortScore) direction = 'LONG';
  else direction = 'SHORT';

  const confidence = totalWeight > 0
    ? Math.round(totalConf / totalWeight)
    : 50;

  // Extract key levels from factor results
  const supportFactors = allFactors.filter(f =>
    f.factorId.includes('SUPPORT') || f.factorId.includes('DEMAND')
  );
  const resistanceFactors = allFactors.filter(f =>
    f.factorId.includes('RESISTANCE') || f.factorId.includes('SUPPLY')
  );
  const support = supportFactors.length > 0
    ? supportFactors.reduce((s, f) => s + (f.rawValue ?? 0), 0) / supportFactors.length
    : 0;
  const resistance = resistanceFactors.length > 0
    ? resistanceFactors.reduce((s, f) => s + (f.rawValue ?? 0), 0) / resistanceFactors.length
    : 0;

  // Detect dominant pattern
  const patternFactors = allFactors
    .filter(f => Math.abs(f.value) > 30)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const pattern = patternFactors.length > 0
    ? patternFactors[0].factorId
    : 'NO_DOMINANT';

  return {
    direction,
    confidence,
    pattern,
    keyLevels: { support, resistance },
    factors: allFactors,
    thesis: `ORPO: ${direction} ${confidence}% [${thesisParts.join(' | ')}]`,
  };
}

// ─── CTX: Layer 1 ───────────────────────────────────────────

/**
 * Convert a DEFENSE/CONTEXT agent output into a CTX belief.
 * Maps confidence + direction → RED/GREEN/NEUTRAL flag.
 */
function buildCtxBelief(output: AgentOutput): CtxBelief | null {
  const ctxId = CTX_AGENT_MAP[output.agentId];
  if (!ctxId) return null;

  // Determine flag based on direction + confidence
  let flag: CtxFlag;
  if (output.confidence < 55 || output.direction === 'NEUTRAL') {
    flag = 'NEUTRAL';
  } else if (output.direction === 'LONG') {
    flag = 'GREEN';
  } else {
    flag = 'RED';
  }

  // Generate headline from top factors
  const topFactor = [...output.factors]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  const headline = topFactor
    ? `${output.agentId}: ${topFactor.detail}`
    : `${output.agentId}: ${flag}`;

  return {
    agentId: ctxId,
    flag,
    confidence: output.confidence,
    headline,
    factors: output.factors,
  };
}

// ─── GUARDIAN: Layer 2 ──────────────────────────────────────

/**
 * Check P0 hard rules.
 * Returns violations and whether to halt.
 */
function runGuardianCheck(
  allFactors: FactorResult[],
  userRR: number,
  dataCompleteness: number
): GuardianCheck {
  const violations: GuardianViolation[] = [];

  // P0-1: RSI ≥ 95 (extreme overbought)
  const rsiFactors = allFactors.filter(f =>
    f.factorId.includes('RSI') && f.rawValue !== undefined
  );
  for (const f of rsiFactors) {
    if (f.rawValue !== undefined && f.rawValue >= P0_RSI_BLOCK) {
      violations.push({
        rule: 'RSI_95',
        detail: `RSI at ${f.rawValue.toFixed(1)} — extreme overbought`,
        severity: 'BLOCK',
      });
    }
  }

  // P0-2: R:R < 1.5
  if (userRR > 0 && userRR < P0_RR_MIN) {
    violations.push({
      rule: 'RR_1_5',
      detail: `R:R ${userRR.toFixed(2)} below minimum ${P0_RR_MIN}`,
      severity: 'WARN',
    });
  }

  // P0-3: Data source down (completeness < 30%)
  if (dataCompleteness < 0.3) {
    violations.push({
      rule: 'DATA_DOWN',
      detail: `Data completeness ${(dataCompleteness * 100).toFixed(0)}% — unreliable`,
      severity: 'BLOCK',
    });
  }

  const hasBlock = violations.some(v => v.severity === 'BLOCK');
  return {
    passed: violations.length === 0,
    violations,
    halt: hasBlock,
  };
}

// ─── COMMANDER: Layer 3 ─────────────────────────────────────

/**
 * Resolve conflict between ORPO and CTX signals.
 * Only invokes logic (future: LLM) when there's a genuine conflict.
 */
function resolveCommander(
  orpo: OrpoOutput,
  ctx: CtxBelief[],
  guardian: GuardianCheck
): CommanderVerdict | null {
  // If guardian halts, override to NEUTRAL
  if (guardian.halt) {
    return {
      finalDirection: 'NEUTRAL',
      entryScore: 0,
      reasoning: 'Guardian HALT — data source unreliable. Blocking entry.',
      conflictResolved: false,
      cost: 0,
    };
  }

  // Count CTX signals
  const greenCount = ctx.filter(c => c.flag === 'GREEN').length;
  const redCount = ctx.filter(c => c.flag === 'RED').length;
  const ctxConsensus: Direction =
    greenCount > redCount ? 'LONG' :
    redCount > greenCount ? 'SHORT' : 'NEUTRAL';

  // Check if ORPO and CTX agree
  const orpoNonNeutral = orpo.direction !== 'NEUTRAL';
  const ctxNonNeutral = ctxConsensus !== 'NEUTRAL';
  const hasConflict = orpoNonNeutral && ctxNonNeutral && orpo.direction !== ctxConsensus;

  if (!hasConflict) {
    // No conflict → pass ORPO through, no LLM needed
    return null;
  }

  // CONFLICT: ORPO says one thing, CTX says another
  // Heuristic resolution (future: LLM call)
  // Rule: If >= 3 CTX agents disagree with ORPO at high confidence, defer to CTX
  const strongDissenters = ctx.filter(c =>
    c.flag !== 'NEUTRAL' &&
    c.confidence >= 70 &&
    ((c.flag === 'RED' && orpo.direction === 'LONG') ||
     (c.flag === 'GREEN' && orpo.direction === 'SHORT'))
  );

  let finalDirection: Direction;
  let reasoning: string;

  if (strongDissenters.length >= 3) {
    finalDirection = ctxConsensus;
    reasoning = `CTX override: ${strongDissenters.length}/4 agents strongly disagree with ORPO (${orpo.direction}). Deferring to CTX consensus (${ctxConsensus}).`;
  } else {
    // ORPO wins with reduced confidence
    finalDirection = orpo.direction;
    reasoning = `ORPO maintained: Conflict with CTX, but only ${strongDissenters.length}/4 strong dissenters. ORPO (${orpo.direction}) prevails with reduced confidence.`;
  }

  // Entry score: starts at ORPO confidence, penalized by conflict
  const conflictPenalty = strongDissenters.length * 10;
  const entryScore = Math.max(0, orpo.confidence - conflictPenalty);

  return {
    finalDirection,
    entryScore,
    reasoning,
    conflictResolved: true,
    cost: 0, // No LLM call in v1 — heuristic only
  };
}

// ─── COMMANDER WITH RAG: Layer 3+ ────────────────────────────

/**
 * RAG + Few-Shot 강화 Commander.
 * 충돌 발생 + RAG 데이터 존재 시 LLM 호출하여 판단.
 * LLM 실패 시 heuristic fallback (resolveCommander).
 *
 * 비용: 충돌 없으면 $0, 충돌 시 ~$0.003-0.008 (500-800 토큰)
 */
async function resolveCommanderWithRAG(
  orpo: OrpoOutput,
  ctx: CtxBelief[],
  guardian: GuardianCheck,
  ragRecall: RAGRecall | null,
  similarGames: SimilarGame[],
  pair: string,
  regime: string,
  timeframe: string
): Promise<CommanderVerdict | null> {
  // Guardian halt → immediate NEUTRAL (no LLM needed)
  if (guardian.halt) {
    return {
      finalDirection: 'NEUTRAL',
      entryScore: 0,
      reasoning: 'Guardian HALT — data source unreliable. Blocking entry.',
      conflictResolved: false,
      cost: 0,
    };
  }

  // Check for conflict
  const greenCount = ctx.filter(c => c.flag === 'GREEN').length;
  const redCount = ctx.filter(c => c.flag === 'RED').length;
  const ctxConsensus: Direction =
    greenCount > redCount ? 'LONG' :
    redCount > greenCount ? 'SHORT' : 'NEUTRAL';

  const orpoNonNeutral = orpo.direction !== 'NEUTRAL';
  const ctxNonNeutral = ctxConsensus !== 'NEUTRAL';
  const hasConflict = orpoNonNeutral && ctxNonNeutral && orpo.direction !== ctxConsensus;

  if (!hasConflict) {
    // No conflict → pass through, no LLM needed
    // But still apply RAG confidence adjustment if available
    if (ragRecall && ragRecall.confidenceAdjustment !== 0) {
      return {
        finalDirection: orpo.direction,
        entryScore: Math.max(0, Math.min(100, orpo.confidence + ragRecall.confidenceAdjustment)),
        reasoning: `No ORPO/CTX conflict. RAG adjustment: ${ragRecall.confidenceAdjustment > 0 ? '+' : ''}${ragRecall.confidenceAdjustment} (${ragRecall.similarGamesFound} similar games, ${(ragRecall.historicalWinRate * 100).toFixed(0)}% win rate).`,
        conflictResolved: false,
        cost: 0,
      };
    }
    return null;
  }

  // CONFLICT exists — try LLM with few-shot if we have RAG data
  const hasFewShot = similarGames.length > 0;

  if (hasFewShot) {
    try {
      const fewShotExamples = buildFewShotExamples(similarGames, 3);
      const messages = buildCommanderMessages(
        orpo, ctx, guardian, ragRecall, fewShotExamples,
        pair, regime, timeframe
      );

      // Dynamic import to avoid server-only module in client context
      const { callLLM } = await import('$lib/server/llmService');

      const llmResult = await callLLM({
        messages,
        maxTokens: 200,
        temperature: 0.3, // Low temp for consistent decisions
        timeoutMs: 10000,
      });

      const parsed = parseCommanderResponse(
        llmResult.text,
        orpo.direction,  // fallback direction
        orpo.confidence  // fallback confidence
      );

      // Apply RAG confidence adjustment on top
      const ragAdj = ragRecall?.confidenceAdjustment ?? 0;
      const entryScore = Math.max(0, Math.min(100, parsed.confidence + ragAdj));

      return {
        finalDirection: parsed.direction,
        entryScore,
        reasoning: `LLM Commander: ${parsed.reasoning}${ragAdj ? ` (RAG adj: ${ragAdj > 0 ? '+' : ''}${ragAdj})` : ''}`,
        conflictResolved: true,
        cost: (llmResult.usage?.promptTokens ?? 0) + (llmResult.usage?.completionTokens ?? 0),
      };
    } catch (llmError) {
      console.warn('[c02Pipeline] LLM Commander failed, falling back to heuristic:', llmError);
      // Fall through to heuristic
    }
  }

  // Heuristic fallback (same as original resolveCommander)
  return resolveCommander(orpo, ctx, guardian);
}

// ─── Main C02 Pipeline ──────────────────────────────────────

export interface C02PipelineInput {
  marketContext: MarketContext;
  userId?: string;
  matchId?: string;
  userRR?: number;               // User's R:R for guardian check
  regime?: string;               // Market regime (trending_up, trending_down, ranging, volatile)
  // RAG Context (optional — graceful degradation if absent)
  ragRecall?: RAGRecall | null;
  similarGames?: SimilarGame[];
}

/**
 * Run the full C02 pipeline:
 * 1. Run all 8 agents via existing agentPipeline
 * 2. Split results into OFFENSE (→ ORPO) and DEFENSE/CONTEXT (→ CTX)
 * 3. Run Guardian P0 checks
 * 4. Commander resolves conflicts (if any)
 */
export async function runC02Pipeline(input: C02PipelineInput): Promise<{
  c02: C02Result;
  rawPipeline: PipelineResult;
}> {
  // Full 8-agent draft (all agents, base specs, equal weight)
  const fullDraft: DraftSelection[] = [
    { agentId: 'STRUCTURE', specId: 'structure_base', weight: 15 },
    { agentId: 'VPA',       specId: 'vpa_base',       weight: 15 },
    { agentId: 'ICT',       specId: 'ict_base',       weight: 10 },
    { agentId: 'DERIV',     specId: 'deriv_base',     weight: 15 },
    { agentId: 'FLOW',      specId: 'flow_base',      weight: 10 },
    { agentId: 'SENTI',     specId: 'senti_base',     weight: 15 },
    { agentId: 'MACRO',     specId: 'macro_base',     weight: 10 },
    { agentId: 'VALUATION', specId: 'valuation_base', weight: 10 },
  ];

  const pipelineInput: PipelineInput = {
    draft: fullDraft,
    marketContext: input.marketContext,
    userId: input.userId,
    matchId: input.matchId,
  };

  // Run existing pipeline
  const rawPipeline = await runAgentPipeline(pipelineInput);

  // Split outputs by role
  const offenseOutputs = rawPipeline.agentOutputs.filter(o =>
    (OFFENSE_AGENTS as readonly string[]).includes(o.agentId)
  );
  const ctxOutputs = rawPipeline.agentOutputs.filter(o =>
    o.agentId in CTX_AGENT_MAP
  );

  // Layer 0: ORPO
  const orpo = buildOrpo(offenseOutputs);

  // Layer 1: CTX
  const ctx: CtxBelief[] = ctxOutputs
    .map(buildCtxBelief)
    .filter((b): b is CtxBelief => b !== null);

  // Layer 2: Guardian
  const allFactors = rawPipeline.agentOutputs.flatMap(o => o.factors);
  const guardian = runGuardianCheck(
    allFactors,
    input.userRR ?? 2.0,
    rawPipeline.meta.dataCompleteness
  );

  // Layer 3: Commander (RAG-enhanced if available, heuristic fallback)
  const hasRAGContext = input.similarGames && input.similarGames.length > 0;
  let commander: CommanderVerdict | null;

  if (hasRAGContext || input.ragRecall) {
    commander = await resolveCommanderWithRAG(
      orpo, ctx, guardian,
      input.ragRecall ?? null,
      input.similarGames ?? [],
      input.marketContext.pair,
      input.regime ?? 'ranging',
      input.marketContext.timeframe ?? '4h'
    );
  } else {
    commander = resolveCommander(orpo, ctx, guardian);
  }

  const c02: C02Result = {
    orpo,
    ctx,
    guardian,
    commander,
    timestamp: Date.now(),
  };

  return { c02, rawPipeline };
}
