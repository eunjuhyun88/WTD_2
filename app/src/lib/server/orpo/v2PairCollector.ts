// ═══════════════════════════════════════════════════════════════
// COGOCHI — ORPO v2 Pair Collector
// Generates chosen/rejected pairs from battle REFLECT output
// 6 cases per Cogochi_ORPOPipeline_20260322 § 2.2
// ═══════════════════════════════════════════════════════════════

import { query } from '$lib/server/db.js';
import type {
  OrpoPairSource,
  OrpoV2Pair,
  AgentDecisionTrace,
  BattleAction,
} from '$lib/contracts/researchV4';

// ─── Collect ORPO pair from a battle tick ──────────────────────

export function collectOrpoPair(source: OrpoPairSource): OrpoV2Pair | null {
  const { outcome, trainerLabel, agentTrace, assembledContext } = source;

  // Case A: APPROVE + WIN → quality 0.9
  if (trainerLabel === 'APPROVED' && outcome === 'WIN') {
    return buildPair(source, agentTrace, buildOpposite(agentTrace), 0.9);
  }

  // Case B: OVERRIDE + WIN → quality 0.95 (strongest learning signal)
  if (trainerLabel === 'OVERRIDDEN' && outcome === 'WIN' && source.trainerAction) {
    const chosenTrace = buildTrainerTrace(source.trainerAction, agentTrace);
    return buildPair(source, chosenTrace, agentTrace, 0.95);
  }

  // Case C: APPROVE + LOSS → NO PAIR (both wrong, noise)
  if (trainerLabel === 'APPROVED' && outcome === 'LOSS') {
    return null;
  }

  // Case D: OVERRIDE + LOSS → chosen=FLAT, quality 0.5
  if (trainerLabel === 'OVERRIDDEN' && outcome === 'LOSS') {
    const flatTrace = buildFlatTrace();
    return buildPair(source, flatTrace, agentTrace, 0.5);
  }

  // Case E: No trainer + WIN (conf > 0.65) → quality 0.6
  if (trainerLabel === null && outcome === 'WIN' && agentTrace.confidence > 0.65) {
    return buildPair(source, agentTrace, buildOpposite(agentTrace), 0.6);
  }

  // Case F: No trainer + LOSS → NO PAIR
  return null;
}

// ─── Save pair to DB ───────────────────────────────────────────

export async function saveOrpoPair(
  userId: string,
  pair: OrpoV2Pair,
): Promise<{ success: boolean; error?: string }> {
  try {
    await query(
      `INSERT INTO orpo_v2_pairs (
        agent_id, user_id, scenario_id, tick,
        context_prompt, chosen_response, rejected_response,
        quality_weight, trainer_label, battle_outcome
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        pair.agentId,
        userId,
        pair.scenarioId ?? null,
        pair.tick ?? null,
        pair.contextPrompt,
        JSON.stringify(pair.chosenResponse),
        JSON.stringify(pair.rejectedResponse),
        pair.qualityWeight,
        pair.trainerLabel ?? null,
        pair.battleOutcome,
      ],
    );
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

// ─── Get pair count for an agent ───────────────────────────────

export async function getOrpoPairCount(
  agentId: string,
  userId: string,
  unusedOnly: boolean = false,
): Promise<number> {
  try {
    const whereClause = unusedOnly
      ? 'AND used_in_training = false'
      : '';

    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::TEXT as count FROM orpo_v2_pairs
       WHERE agent_id = $1 AND user_id = $2 ${whereClause}`,
      [agentId, userId],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  } catch {
    return 0;
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function buildPair(
  source: OrpoPairSource,
  chosen: AgentDecisionTrace,
  rejected: AgentDecisionTrace,
  qualityWeight: number,
): OrpoV2Pair {
  return {
    id: `orpo-${source.agentId}-${source.tick}-${Date.now()}`,
    agentId: source.agentId,
    scenarioId: source.scenarioId,
    tick: source.tick,
    contextPrompt: source.assembledContext,
    chosenResponse: chosen,
    rejectedResponse: rejected,
    qualityWeight,
    trainerLabel: source.trainerLabel,
    battleOutcome: source.outcome,
    createdAt: Date.now(),
  };
}

function buildOpposite(trace: AgentDecisionTrace): AgentDecisionTrace {
  const opposite: BattleAction = trace.action === 'LONG' ? 'SHORT'
    : trace.action === 'SHORT' ? 'LONG'
    : 'FLAT';

  return {
    ...trace,
    action: opposite,
    confidence: 0.5,
    thesis: `Opposite of: ${trace.thesis}`,
    fallbackUsed: true,
    fallbackReason: 'orpo_synthetic_rejected',
    providerLabel: 'orpo:synthetic',
  };
}

function buildTrainerTrace(
  trainerAction: BattleAction,
  originalTrace: AgentDecisionTrace,
): AgentDecisionTrace {
  return {
    ...originalTrace,
    action: trainerAction,
    thesis: `Trainer override: ${trainerAction}`,
    providerLabel: 'trainer:override',
    fallbackUsed: false,
  };
}

function buildFlatTrace(): AgentDecisionTrace {
  return {
    action: 'FLAT',
    confidence: 0.6,
    thesis: 'Uncertain — better to wait',
    invalidation: '',
    evidenceTitles: [],
    riskFlags: [],
    memoryIdsUsed: [],
    fallbackUsed: true,
    fallbackReason: 'orpo_flat_chosen',
    providerLabel: 'orpo:flat',
  };
}
