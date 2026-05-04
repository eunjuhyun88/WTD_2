import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { query } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;

  const evalRes = await query<{
    id: string;
    status: string;
    trading_days: number;
    equity_start: number;
    equity_current: number;
    started_at: string | null;
    ended_at: string | null;
    user_id: string;
  }>(
    `SELECT id, status, trading_days, equity_start, equity_current,
            started_at, ended_at, user_id
     FROM evaluations WHERE id = $1 LIMIT 1`,
    [id],
  );

  if (!evalRes.rows.length) error(404, 'Evaluation not found');
  const evaluation = evalRes.rows[0];

  const verRes = await query<{
    result: string;
    snapshot: unknown;
    signed_hash: string;
    created_at: string;
  }>(
    `SELECT result, snapshot, signed_hash, created_at
     FROM verification_runs WHERE evaluation_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [id],
  );

  const verification = verRes.rows[0] ?? null;

  return { evaluation, verification };
};
