import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

const VALID_AGENT_ID = /^[a-z_]{2,32}$/;
const PAGE_SIZE = 50;

/**
 * GET /api/agents/stats/[agentId]
 * Returns single-agent stats + cursor-paginated recent decisions.
 *
 * Query params:
 *   cursor — ISO timestamp; return decisions older than this (for pagination)
 */
export const GET: RequestHandler = async ({ params, url }) => {
  const agentId = params.agentId;
  if (!VALID_AGENT_ID.test(agentId)) {
    return json({ error: 'Invalid agent id' }, { status: 400 });
  }

  const cursor = url.searchParams.get('cursor');

  try {
    // Stats from view
    const statsResult = await query<{
      agent_id: string;
      total_decisions: string;
      decisions_30d: string;
      verdicts_with_signal: string;
      avg_latency_ms: string | null;
      p95_latency_ms: string | null;
      last_decision_at: string | null;
      first_decision_at: string | null;
      unique_users: string;
    }>(
      `SELECT * FROM v_agent_stats WHERE agent_id = $1`,
      [agentId]
    );

    const statsRow = statsResult.rows[0] ?? null;

    // Recent decisions with cursor pagination
    const decisionsResult = await query<{
      id: string;
      cmd: string;
      args_json: Record<string, unknown>;
      llm_verdict: string | null;
      latency_ms: number | null;
      created_at: string;
    }>(
      cursor
        ? `SELECT id, cmd, args_json, llm_verdict, latency_ms, created_at
           FROM agent_interactions
           WHERE cmd = $1
             AND created_at < $2::timestamptz
           ORDER BY created_at DESC
           LIMIT $3`
        : `SELECT id, cmd, args_json, llm_verdict, latency_ms, created_at
           FROM agent_interactions
           WHERE cmd = $1
           ORDER BY created_at DESC
           LIMIT $2`,
      cursor ? [agentId, cursor, PAGE_SIZE] : [agentId, PAGE_SIZE]
    );

    const decisions = decisionsResult.rows;
    const nextCursor =
      decisions.length === PAGE_SIZE
        ? decisions[decisions.length - 1].created_at
        : null;

    return json({
      success: true,
      agent_id: agentId,
      stats: statsRow
        ? {
            total_decisions: Number(statsRow.total_decisions),
            decisions_30d: Number(statsRow.decisions_30d),
            verdicts_with_signal: Number(statsRow.verdicts_with_signal),
            avg_latency_ms:
              statsRow.avg_latency_ms != null ? Number(statsRow.avg_latency_ms) : null,
            p95_latency_ms:
              statsRow.p95_latency_ms != null ? Number(statsRow.p95_latency_ms) : null,
            last_decision_at: statsRow.last_decision_at,
            first_decision_at: statsRow.first_decision_at,
            unique_users: Number(statsRow.unique_users),
          }
        : null,
      recent_decisions: decisions,
      next_cursor: nextCursor,
    });
  } catch (err) {
    console.error(`[api/agents/stats/${agentId}] GET error:`, err);
    return json({
      success: true,
      agent_id: agentId,
      stats: null,
      recent_decisions: [],
      next_cursor: null,
    });
  }
};

/**
 * PATCH /api/agents/stats/[agentId]
 * No-op — client sync placeholder.
 */
export const PATCH: RequestHandler = async () => {
  return json({ success: true });
};
