import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import type { DecisionRow } from '$lib/hubs/agent/panels/decisions.types';

const VALID_AGENT_ID = /^[a-z_]{2,32}$/;
const DEFAULT_LIMIT = 50;

function mockRows(agentId: string): DecisionRow[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `mock-${agentId}-${i}`,
    cmd: ['ENTER', 'EXIT', 'HOLD', 'SCAN'][i % 4],
    llm_verdict: ['BULLISH', 'BEARISH', 'NEUTRAL', null][i % 4],
    latency_ms: 120 + i * 15,
    created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
    features_json: {
      rsi: 55 + i,
      macd_signal: 0.002 * (i + 1),
      volume_ratio: 1.2,
    },
  }));
}

/**
 * GET /api/agents/decisions/[agentId]?cursor=ISO&limit=50
 * Cursor-paginated decisions for a given agent.
 * cursor = created_at of last row (ISO string), next page returns rows older than cursor.
 */
export const GET: RequestHandler = async ({ params, url }) => {
  const agentId = params.agentId;
  if (!VALID_AGENT_ID.test(agentId)) {
    return json({ error: 'Invalid agent id' }, { status: 400 });
  }

  const cursor = url.searchParams.get('cursor');
  const limitParam = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200
    ? limitParam
    : DEFAULT_LIMIT;

  try {
    const decisionsResult = await query<{
      id: string;
      cmd: string;
      llm_verdict: string | null;
      latency_ms: number | null;
      created_at: string;
      features_json: Record<string, unknown> | null;
    }>(
      cursor
        ? `SELECT id, cmd, llm_verdict, latency_ms, created_at, features_json
           FROM agent_interactions
           WHERE agent_id = $1
             AND created_at < $2::timestamptz
           ORDER BY created_at DESC
           LIMIT $3`
        : `SELECT id, cmd, llm_verdict, latency_ms, created_at, features_json
           FROM agent_interactions
           WHERE agent_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
      cursor ? [agentId, cursor, limit] : [agentId, limit]
    );

    const rows: DecisionRow[] = decisionsResult.rows.map((r) => ({
      id: r.id,
      cmd: r.cmd,
      llm_verdict: r.llm_verdict,
      latency_ms: r.latency_ms != null ? Number(r.latency_ms) : null,
      created_at: r.created_at,
      features_json: r.features_json ?? null,
    }));

    const next_cursor = rows.length === limit ? rows[rows.length - 1].created_at : null;

    return json({ rows, next_cursor });
  } catch (err) {
    console.error(`[api/agents/decisions/${agentId}] GET error:`, err);
    const rows = mockRows(agentId);
    return json({ rows, next_cursor: null });
  }
};
