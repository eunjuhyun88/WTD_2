import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

export interface VerdictRow {
  id: string;
  symbol: string;
  verdict: string;
  created_at: string;
}

export interface FlywheelStatusResponse {
  progress_pct: number;
  recent_verdicts: VerdictRow[];
  next_retrain_at: string | null;
}

const MOCK_FALLBACK: FlywheelStatusResponse = {
  progress_pct: 42,
  recent_verdicts: [],
  next_retrain_at: null,
};

/**
 * GET /api/terminal/flywheel/status
 *
 * Aggregates Layer C stats from agent_interactions table.
 * Falls back to mock data when DB is unavailable or table does not exist.
 */
export const GET: RequestHandler = async () => {
  try {
    // Recent 20 verdicts from Layer C agent interactions
    const verdictsResult = await query<{
      id: string;
      symbol: string;
      verdict: string;
      created_at: string;
    }>(`
      SELECT
        id::text,
        COALESCE(metadata->>'symbol', 'UNKNOWN') AS symbol,
        COALESCE(metadata->>'verdict', output_summary) AS verdict,
        created_at::text
      FROM agent_interactions
      WHERE layer = 'C'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // Progress: ratio of Layer C interactions with a verdict in last 30 days
    const progressResult = await query<{ progress_pct: string }>(`
      SELECT
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE metadata->>'verdict' IS NOT NULL)
          / NULLIF(COUNT(*), 0),
          1
        ) AS progress_pct
      FROM agent_interactions
      WHERE layer = 'C'
        AND created_at >= NOW() - INTERVAL '30 days'
    `);

    // Next retrain schedule (if a retrain_schedule table exists, else null)
    let next_retrain_at: string | null = null;
    try {
      const retrainResult = await query<{ next_run_at: string }>(`
        SELECT next_run_at::text
        FROM retrain_schedule
        WHERE active = true
        ORDER BY next_run_at ASC
        LIMIT 1
      `);
      next_retrain_at = retrainResult.rows[0]?.next_run_at ?? null;
    } catch {
      // retrain_schedule table doesn't exist — that's fine
    }

    const progress_pct = progressResult.rows[0]?.progress_pct
      ? Number(progressResult.rows[0].progress_pct)
      : 0;

    const recent_verdicts: VerdictRow[] = verdictsResult.rows.map((r: {
      id: string;
      symbol: string;
      verdict: string;
      created_at: string;
    }) => ({
      id: r.id,
      symbol: r.symbol,
      verdict: r.verdict ?? '',
      created_at: r.created_at,
    }));

    const response: FlywheelStatusResponse = {
      progress_pct,
      recent_verdicts,
      next_retrain_at,
    };

    return json(response);
  } catch (err) {
    console.error('[api/terminal/flywheel/status] GET error — using mock fallback:', err);
    return json(MOCK_FALLBACK);
  }
};
