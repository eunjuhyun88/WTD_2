// ═══════════════════════════════════════════════════════════════
// COGOCHI — Memory Card Builder
// Persists MemoryRecord[] from battle REFLECT state to PostgreSQL
// Design: Cogochi_MemorySystemDesign_20260322 § 3
// ═══════════════════════════════════════════════════════════════

import { query } from '$lib/server/db.js';
import type { MemoryRecord } from '$lib/engine/v4/types.js';

// ─── Save memory cards to DB ───────────────────────────────────

export async function saveMemoryCards(
  userId: string,
  cards: MemoryRecord[],
): Promise<{ saved: number; errors: string[] }> {
  const errors: string[] = [];
  let saved = 0;

  for (const card of cards) {
    try {
      await query(
        `INSERT INTO agent_memories (
          agent_id, user_id, kind, scenario_id, symbol, regime,
          primary_zone, action, outcome, title, lesson, detail,
          importance, success_score, is_doctrine_card
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          card.agentId,
          userId,
          card.kind,
          card.scenarioId ?? null,
          card.symbol,
          card.regime ?? null,
          card.primaryZone ?? null,
          card.action ?? null,
          card.outcome ?? null,
          card.title,
          card.lesson,
          card.detail ?? null,
          card.importance,
          card.successScore,
          card.isDoctrineCard,
        ],
      );
      saved++;
    } catch (err: any) {
      // Graceful degradation: log warning but don't crash
      const msg = err?.message ?? 'Unknown error';
      if (isTableMissing(msg)) {
        errors.push('agent_memories table not found — run migration 0007');
        break; // No point trying more if table missing
      }
      errors.push(`Failed to save card "${card.title}": ${msg}`);
    }
  }

  return { saved, errors };
}

// ─── Save single DOCTRINE card ─────────────────────────────────

export async function saveDoctrine(
  userId: string,
  agentId: string,
  title: string,
  lesson: string,
  detail?: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const result = await query<{ id: string }>(
      `INSERT INTO agent_memories (
        agent_id, user_id, kind, title, lesson, detail,
        importance, success_score, is_doctrine_card
      ) VALUES ($1, $2, 'DOCTRINE', $3, $4, $5, 1.0, 0, true)
      RETURNING id`,
      [agentId, userId, title, lesson, detail ?? null],
    );
    return { success: true, id: result.rows[0]?.id };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}

// ─── Increment retrieval count (called during RETRIEVE) ────────

export async function incrementRetrievalCount(memoryIds: string[]): Promise<void> {
  if (memoryIds.length === 0) return;

  try {
    await query(
      `UPDATE agent_memories
       SET retrieval_count = retrieval_count + 1, updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [memoryIds],
    );
  } catch {
    // Non-critical — don't crash if this fails
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function isTableMissing(msg: string): boolean {
  return msg.includes('relation "agent_memories" does not exist')
    || msg.includes('42P01');
}
