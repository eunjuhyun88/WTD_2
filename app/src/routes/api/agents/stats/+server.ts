import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

/**
 * GET /api/agents/stats
 * Returns aggregated stats for all agents from v_agent_stats view.
 * Gracefully degrades to empty array if the view is not yet available.
 */
export const GET: RequestHandler = async () => {
  try {
    const result = await query<{
      agent_id: string;
      total_decisions: string;
      decisions_30d: string;
      verdicts_with_signal: string;
      avg_latency_ms: string | null;
      p95_latency_ms: string | null;
      last_decision_at: string | null;
      first_decision_at: string | null;
      unique_users: string;
    }>(`
      SELECT
        agent_id,
        total_decisions,
        decisions_30d,
        verdicts_with_signal,
        avg_latency_ms,
        p95_latency_ms,
        last_decision_at,
        first_decision_at,
        unique_users
      FROM v_agent_stats
      ORDER BY total_decisions DESC
    `);

    const records = result.rows.map((row) => ({
      agent_id: row.agent_id,
      total_decisions: Number(row.total_decisions),
      decisions_30d: Number(row.decisions_30d),
      verdicts_with_signal: Number(row.verdicts_with_signal),
      avg_latency_ms: row.avg_latency_ms != null ? Number(row.avg_latency_ms) : null,
      p95_latency_ms: row.p95_latency_ms != null ? Number(row.p95_latency_ms) : null,
      last_decision_at: row.last_decision_at,
      first_decision_at: row.first_decision_at,
      unique_users: Number(row.unique_users),
    }));

    return json({ success: true, records });
  } catch (err) {
    console.error('[api/agents/stats] GET error:', err);
    return json({ success: true, records: [] });
  }
};
