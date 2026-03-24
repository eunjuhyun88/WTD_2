// ═══════════════════════════════════════════════════════════════
// COGOCHI — L2 Long-term Semantic Memory (PostgreSQL MVP)
// Filtered search over agent_memories with scoring.
// MVP uses PostgreSQL WHERE filters. Qdrant swap later via interface.
// Design: Cogochi_MemorySystemDesign_20260322 § 1.L2
// ═══════════════════════════════════════════════════════════════

import { query } from '$lib/server/db.js';
import type { MemoryRecord, RetrievalQuery } from '$lib/engine/v4/types.js';

// ─── Search interface (swappable to Qdrant later) ──────────────

export interface MemorySearchOptions {
  agentId: string;
  userId: string;
  query: RetrievalQuery;
  topK?: number;
  maxAgeMs?: number;             // filter by recency
  excludeScenarioId?: string;    // prevent future leakage
}

export interface MemorySearchResult {
  memories: MemoryRecord[];
  totalFound: number;
}

// ─── Main search ───────────────────────────────────────────────

export async function searchMemories(
  opts: MemorySearchOptions,
): Promise<MemorySearchResult> {
  const topK = opts.topK ?? 10;

  try {
    // Build WHERE conditions
    const conditions: string[] = [
      'agent_id = $1',
      'user_id = $2',
    ];
    const params: unknown[] = [opts.agentId, opts.userId];
    let paramIdx = 3;

    // Optional filters
    if (opts.query.regime) {
      conditions.push(`regime = $${paramIdx}`);
      params.push(opts.query.regime);
      paramIdx++;
    }

    if (opts.query.primaryZone) {
      conditions.push(`primary_zone = $${paramIdx}`);
      params.push(opts.query.primaryZone);
      paramIdx++;
    }

    if (opts.excludeScenarioId) {
      conditions.push(`(scenario_id IS NULL OR scenario_id != $${paramIdx})`);
      params.push(opts.excludeScenarioId);
      paramIdx++;
    }

    if (opts.maxAgeMs) {
      conditions.push(`created_at >= NOW() - INTERVAL '1 millisecond' * $${paramIdx}`);
      params.push(opts.maxAgeMs);
      paramIdx++;
    }

    // Exclude highly compacted (level 2)
    conditions.push('compaction_level < 2');

    params.push(topK);
    const limitParam = paramIdx;

    const sql = `
      SELECT
        id, agent_id, kind, scenario_id, symbol, regime,
        primary_zone, action, outcome, title, lesson, detail,
        importance, success_score, retrieval_count, compaction_level,
        is_doctrine_card, created_at, updated_at
      FROM agent_memories
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE WHEN is_doctrine_card THEN 0 ELSE 1 END,
        importance DESC,
        created_at DESC
      LIMIT $${limitParam}
    `;

    const result = await query<DbMemoryRow>(sql, params);

    const memories = result.rows.map((row: DbMemoryRow) => rowToMemoryRecord(row, opts.query));

    return {
      memories,
      totalFound: memories.length,
    };
  } catch (err: any) {
    console.warn('[l2Search] Query failed:', err?.message);
    return { memories: [], totalFound: 0 };
  }
}

// ─── Score a memory against the current query ──────────────────

function scoreMemory(row: DbMemoryRow, q: RetrievalQuery): number {
  let score = 0;
  const now = Date.now();
  const createdAt = new Date(row.created_at).getTime();

  // Semantic similarity placeholder (0.30)
  score += 0.30 * 0.5;

  // Lexical similarity placeholder (0.15)
  score += 0.15 * 0.5;

  // Recency (0.12) — decay over 30 days
  const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
  score += 0.12 * Math.max(0, 1 - ageDays / 30);

  // Success weight (0.12)
  const successWeight = row.kind === 'SUCCESS_CASE' ? 1.0
    : row.kind === 'FAILURE_CASE' ? -0.5
    : 0;
  score += 0.12 * Math.max(0, (successWeight + 1) / 2);

  // Importance (0.10)
  score += 0.10 * (parseFloat(String(row.importance)) || 0.5);

  // Role match (0.08) — would need agent role info
  score += 0.08 * 0.5;

  // Regime match (0.08)
  score += 0.08 * (row.regime === q.regime ? 1 : 0);

  // Symbol match (0.05)
  score += 0.05 * 1; // always BTCUSDT for now

  return score;
}

// ─── DB row to MemoryRecord ────────────────────────────────────

interface DbMemoryRow {
  id: string;
  agent_id: string;
  kind: string;
  scenario_id: string | null;
  symbol: string;
  regime: string | null;
  primary_zone: string | null;
  action: string | null;
  outcome: string | null;
  title: string;
  lesson: string;
  detail: string | null;
  importance: string | number;
  success_score: string | number;
  retrieval_count: number;
  compaction_level: number;
  is_doctrine_card: boolean;
  created_at: string;
  updated_at: string;
}

function rowToMemoryRecord(row: DbMemoryRow, q: RetrievalQuery): MemoryRecord {
  const score = scoreMemory(row, q);

  return {
    id: row.id,
    agentId: row.agent_id,
    kind: row.kind as MemoryRecord['kind'],
    scenarioId: row.scenario_id ?? undefined,
    symbol: row.symbol,
    regime: row.regime ?? undefined,
    primaryZone: row.primary_zone ?? undefined,
    action: row.action ?? undefined,
    outcome: row.outcome ?? undefined,
    title: row.title,
    lesson: row.lesson,
    detail: row.detail ?? undefined,
    importance: parseFloat(String(row.importance)) || 0.5,
    successScore: parseFloat(String(row.success_score)) || 0,
    retrievalCount: row.retrieval_count,
    compactionLevel: row.compaction_level,
    isDoctrineCard: row.is_doctrine_card,
    score,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}
