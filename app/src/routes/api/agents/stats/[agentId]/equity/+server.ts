import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

const VALID_AGENT_ID = /^[a-z_]{2,32}$/;
const SNAPSHOT_DAYS = 90;

interface EquityRow {
  snapshot_date: string;
  decision_count: number;
  buy_count: number;
  sell_count: number;
  watch_count: number;
  avg_latency_ms: number | null;
  cumulative_decisions: number;
}

/**
 * GET /api/agents/stats/[agentId]/equity
 * Returns 90-day equity snapshots for an agent.
 * Falls back to on-demand aggregation from agent_interactions if no snapshots exist.
 */
export const GET: RequestHandler = async ({ params }) => {
  const agentId = params.agentId;
  if (!VALID_AGENT_ID.test(agentId)) {
    return json({ error: 'Invalid agent id' }, { status: 400 });
  }

  try {
    // Try pre-computed snapshots first
    const snapshotResult = await query<EquityRow>(
      `SELECT
         snapshot_date,
         decision_count,
         buy_count,
         sell_count,
         watch_count,
         avg_latency_ms,
         cumulative_decisions
       FROM agent_equity_snapshots
       WHERE agent_id = $1
         AND snapshot_date >= (CURRENT_DATE - $2::int)
       ORDER BY snapshot_date ASC`,
      [agentId, SNAPSHOT_DAYS]
    );

    if (snapshotResult.rows.length > 0) {
      return json({ success: true, source: 'snapshots', rows: snapshotResult.rows });
    }

    // On-demand fallback: aggregate from agent_interactions
    const onDemandResult = await query<{
      snapshot_date: string;
      decision_count: string;
      buy_count: string;
      sell_count: string;
      watch_count: string;
      avg_latency_ms: string | null;
    }>(
      `SELECT
         DATE(created_at)                                         AS snapshot_date,
         COUNT(*)                                                 AS decision_count,
         COUNT(*) FILTER (WHERE llm_verdict = 'buy')             AS buy_count,
         COUNT(*) FILTER (WHERE llm_verdict = 'sell')            AS sell_count,
         COUNT(*) FILTER (WHERE llm_verdict = 'watch')           AS watch_count,
         ROUND(AVG(latency_ms)::numeric, 1)                      AS avg_latency_ms
       FROM agent_interactions
       WHERE cmd = $1
         AND created_at >= now() - ($2::int || ' days')::interval
       GROUP BY DATE(created_at)
       ORDER BY snapshot_date ASC`,
      [agentId, SNAPSHOT_DAYS]
    );

    // Compute running cumulative_decisions
    let cumulative = 0;
    const rows: EquityRow[] = onDemandResult.rows.map((row) => {
      const count = Number(row.decision_count);
      cumulative += count;
      return {
        snapshot_date: row.snapshot_date,
        decision_count: count,
        buy_count: Number(row.buy_count),
        sell_count: Number(row.sell_count),
        watch_count: Number(row.watch_count),
        avg_latency_ms: row.avg_latency_ms != null ? Number(row.avg_latency_ms) : null,
        cumulative_decisions: cumulative,
      };
    });

    return json({ success: true, source: 'on_demand', rows });
  } catch (err) {
    console.error(`[api/agents/stats/${agentId}/equity] GET error:`, err);
    return json({ success: true, source: 'error', rows: [] });
  }
};
