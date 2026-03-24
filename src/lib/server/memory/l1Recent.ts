// ═══════════════════════════════════════════════════════════════
// COGOCHI — L1 Recent Memory (on-demand, lightweight DB query)
// Returns the most recent N battle summaries for an agent.
// No vector search — simple ORDER BY created_at DESC LIMIT.
// Cache: 5min per agent_id (in-memory).
// Design: Cogochi_MemorySystemDesign_20260322 § 1.L1
// ═══════════════════════════════════════════════════════════════

import { query } from '$lib/server/db.js';
import type { MemoryRecord } from '$lib/engine/v4/types.js';

// ─── In-memory cache (5 min TTL per agent) ─────────────────────

const cache = new Map<string, { data: L1RecentMemory; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface L1RecentMemory {
  recentBattles: Array<{
    scenarioId: string;
    outcome: string;
    action: string;
    lesson: string;
    createdAt: number;
  }>;
  recentPatterns: Array<{
    pattern: string;
    hitCount: number;
    lastSeen: number;
  }>;
  recentFailures: Array<{
    failureMode: string;
    count: number;
    lastSeen: number;
  }>;
}

// ─── Main entry ────────────────────────────────────────────────

export async function getL1RecentMemory(
  agentId: string,
  userId: string,
  limit: number = 20,
): Promise<L1RecentMemory> {
  // Check cache
  const cacheKey = `${userId}:${agentId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    // Recent battles
    const battlesResult = await query<{
      scenario_id: string;
      outcome: string;
      action: string;
      lesson: string;
      created_at: string;
    }>(
      `SELECT scenario_id, outcome, action, lesson, created_at
       FROM agent_memories
       WHERE agent_id = $1 AND user_id = $2
         AND kind IN ('SUCCESS_CASE', 'FAILURE_CASE', 'MATCH_SUMMARY')
       ORDER BY created_at DESC
       LIMIT $3`,
      [agentId, userId, limit],
    );

    const recentBattles = battlesResult.rows.map((r: { scenario_id: string; outcome: string; action: string; lesson: string; created_at: string }) => ({
      scenarioId: r.scenario_id ?? '',
      outcome: r.outcome ?? 'NEUTRAL',
      action: r.action ?? 'FLAT',
      lesson: r.lesson,
      createdAt: new Date(r.created_at).getTime(),
    }));

    // Recent patterns (aggregated by primaryZone + action)
    const patternsResult = await query<{
      pattern: string;
      hit_count: string;
      last_seen: string;
    }>(
      `SELECT
         COALESCE(primary_zone, 'UNKNOWN') || ' + ' || COALESCE(action, 'FLAT') as pattern,
         COUNT(*)::TEXT as hit_count,
         MAX(created_at)::TEXT as last_seen
       FROM agent_memories
       WHERE agent_id = $1 AND user_id = $2
         AND kind IN ('SUCCESS_CASE', 'FAILURE_CASE')
       GROUP BY primary_zone, action
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      [agentId, userId],
    );

    const recentPatterns = patternsResult.rows.map((r: { pattern: string; hit_count: string; last_seen: string }) => ({
      pattern: r.pattern,
      hitCount: parseInt(r.hit_count, 10),
      lastSeen: new Date(r.last_seen).getTime(),
    }));

    // Recent failures (grouped by lesson keyword)
    const failuresResult = await query<{
      failure_mode: string;
      count: string;
      last_seen: string;
    }>(
      `SELECT
         SUBSTRING(lesson FROM 1 FOR 30) as failure_mode,
         COUNT(*)::TEXT as count,
         MAX(created_at)::TEXT as last_seen
       FROM agent_memories
       WHERE agent_id = $1 AND user_id = $2
         AND kind = 'FAILURE_CASE'
       GROUP BY SUBSTRING(lesson FROM 1 FOR 30)
       ORDER BY COUNT(*) DESC
       LIMIT 5`,
      [agentId, userId],
    );

    const recentFailures = failuresResult.rows.map((r: { failure_mode: string; count: string; last_seen: string }) => ({
      failureMode: r.failure_mode,
      count: parseInt(r.count, 10),
      lastSeen: new Date(r.last_seen).getTime(),
    }));

    const result: L1RecentMemory = { recentBattles, recentPatterns, recentFailures };

    // Cache
    cache.set(cacheKey, { data: result, expiry: Date.now() + CACHE_TTL_MS });

    return result;
  } catch (err: any) {
    // Graceful degradation
    console.warn('[l1Recent] Query failed:', err?.message);
    return { recentBattles: [], recentPatterns: [], recentFailures: [] };
  }
}

// ─── Invalidate cache (call after battle ends) ─────────────────

export function invalidateL1Cache(agentId: string, userId: string): void {
  cache.delete(`${userId}:${agentId}`);
}

export function clearL1Cache(): void {
  cache.clear();
}
