import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

interface TelemetryRow {
  id: string;
  created_at: string;
  symbol: string | null;
  timeframe: string | null;
  user_message: string;
  tools_invoked: string[];
  latency_ms: number | null;
  cost_usd: number | null;
  model_id: string | null;
  user_reaction: string | null;
}

export const GET: RequestHandler = async () => {
  const { rows: allRows } = await query<TelemetryRow>(
    `SELECT id, created_at, symbol, timeframe, user_message, tools_invoked,
            latency_ms, cost_usd, model_id, user_reaction
     FROM agent_telemetry
     ORDER BY created_at DESC
     LIMIT 50`
  );

  const total = allRows.length;
  const avg_latency = total
    ? Math.round(allRows.reduce((s: number, r: TelemetryRow) => s + (r.latency_ms ?? 0), 0) / total)
    : 0;
  const avg_cost = total
    ? allRows.reduce((s: number, r: TelemetryRow) => s + Number(r.cost_usd ?? 0), 0) / total
    : 0;
  const thumbs_down = allRows.filter((r: TelemetryRow) => r.user_reaction === 'thumbs_down').length;
  const thumbs_down_rate = total ? (thumbs_down / total) * 100 : 0;

  return json({
    rows: allRows,
    stats: { total, avg_latency, avg_cost, thumbs_down_rate },
  });
};
