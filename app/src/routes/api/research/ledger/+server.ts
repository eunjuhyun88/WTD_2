import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

interface LedgerRow {
  cycle_id: number;
  status: string;
  strategy: string;
  candidates_proposed: number | null;
  candidates_after_l2: number | null;
  dsr_delta: number | null;
  cost_usd: number | null;
  latency_sec: number | null;
  commit_sha: string | null;
  created_at: string;
}

export const GET: RequestHandler = async ({ url }) => {
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0'), 0);

  try {
    const res = await query<LedgerRow>(
      `SELECT cycle_id, status, strategy,
              candidates_proposed, candidates_after_l2,
              dsr_delta, cost_usd, latency_sec,
              commit_sha, created_at
       FROM autoresearch_ledger
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const entries = res.rows.map((r) => ({
      cycleId:            r.cycle_id,
      status:             r.status,
      strategy:           r.strategy,
      candidatesProposed: r.candidates_proposed ?? 0,
      candidatesAfterL2:  r.candidates_after_l2 ?? 0,
      dsrDelta:           r.dsr_delta ?? 0,
      costUsd:            r.cost_usd ?? 0,
      latencySec:         r.latency_sec ?? 0,
      commitSha:          r.commit_sha ?? '',
      createdAt:          r.created_at,
    }));

    return json({ ok: true, entries });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
