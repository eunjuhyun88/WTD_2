/**
 * GET /api/copy-trading/leaderboard
 *
 * Returns top-20 traders ranked by JUDGE score.
 * Public endpoint — no auth required (profiles have public read RLS).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  judgeScore: number;
  winCount: number;
  lossCount: number;
  rank: number;
}

export const GET: RequestHandler = async ({ url }) => {
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 100);

  const result = await query<{
    user_id: string;
    display_name: string;
    judge_score: string;
    win_count: string;
    loss_count: string;
  }>(
    `SELECT user_id, display_name, judge_score, win_count, loss_count
     FROM trader_profiles
     ORDER BY judge_score DESC
     LIMIT $1`,
    [limit],
  );

  type ProfileRow = {
    user_id: string;
    display_name: string;
    judge_score: string;
    win_count: string;
    loss_count: string;
  };
  const traders: LeaderboardEntry[] = (result.rows as ProfileRow[]).map((row, i) => ({
    userId: row.user_id,
    displayName: row.display_name,
    judgeScore: Number(row.judge_score),
    winCount: Number(row.win_count),
    lossCount: Number(row.loss_count),
    rank: i + 1,
  }));

  return json({ ok: true, traders });
};
