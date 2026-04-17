// ═══════════════════════════════════════════════════════════════
// COGOCHI — ORPO v2 Training Trigger Evaluator
// Checks if enough quality pairs have accumulated to trigger training
// Design: Cogochi_ORPOPipeline_20260322 § 3
// ═══════════════════════════════════════════════════════════════

import { query } from '$lib/server/db.js';
import { V4_CONFIG } from '$lib/contracts/researchV4';

export interface TriggerResult {
  shouldTrain: boolean;
  reason: string;
  stats: {
    totalPairs: number;
    avgQuality: number;
    hasLongChosen: boolean;
    hasShortChosen: boolean;
    hasFlatChosen: boolean;
  };
}

export async function evaluateTrainingTrigger(
  agentId: string,
  userId: string,
): Promise<TriggerResult> {
  try {
    const result = await query<{
      total: string;
      avg_quality: string;
      has_long: boolean;
      has_short: boolean;
      has_flat: boolean;
    }>(
      `SELECT
         COUNT(*)::TEXT as total,
         COALESCE(AVG(quality_weight), 0)::TEXT as avg_quality,
         BOOL_OR(chosen_response->>'action' = 'LONG') as has_long,
         BOOL_OR(chosen_response->>'action' = 'SHORT') as has_short,
         BOOL_OR(chosen_response->>'action' = 'FLAT') as has_flat
       FROM orpo_v2_pairs
       WHERE agent_id = $1 AND user_id = $2 AND used_in_training = false`,
      [agentId, userId],
    );

    const row = result.rows[0];
    const totalPairs = parseInt(row?.total ?? '0', 10);
    const avgQuality = parseFloat(row?.avg_quality ?? '0');
    const hasLongChosen = row?.has_long ?? false;
    const hasShortChosen = row?.has_short ?? false;
    const hasFlatChosen = row?.has_flat ?? false;

    const stats = { totalPairs, avgQuality, hasLongChosen, hasShortChosen, hasFlatChosen };

    // Check conditions
    if (totalPairs < V4_CONFIG.ORPO_MIN_PAIRS) {
      return {
        shouldTrain: false,
        reason: `Need ${V4_CONFIG.ORPO_MIN_PAIRS} pairs, have ${totalPairs}`,
        stats,
      };
    }

    if (avgQuality < V4_CONFIG.ORPO_MIN_QUALITY) {
      return {
        shouldTrain: false,
        reason: `Average quality ${avgQuality.toFixed(2)} below threshold ${V4_CONFIG.ORPO_MIN_QUALITY}`,
        stats,
      };
    }

    if (!hasLongChosen && !hasShortChosen) {
      return {
        shouldTrain: false,
        reason: 'Need at least one LONG and one SHORT chosen response for diversity',
        stats,
      };
    }

    return {
      shouldTrain: true,
      reason: `Ready: ${totalPairs} pairs, avg quality ${avgQuality.toFixed(2)}, direction diversity OK`,
      stats,
    };
  } catch (err: any) {
    return {
      shouldTrain: false,
      reason: `Evaluation error: ${err?.message}`,
      stats: { totalPairs: 0, avgQuality: 0, hasLongChosen: false, hasShortChosen: false, hasFlatChosen: false },
    };
  }
}
