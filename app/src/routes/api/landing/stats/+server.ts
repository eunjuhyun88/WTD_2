// GET /api/landing/stats
// Public aggregate stats for the landing page LiveStatStrip.
// Returns active_patterns / verdict_accuracy_7d / active_users_24h.
// 30s CDN cache; falls back to mock on any error.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  try {
    // active_patterns: pattern_objects where state = 'ACTIVE'
    const activeRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM pattern_objects WHERE state = 'ACTIVE'`,
      []
    );
    const active_patterns = parseInt(activeRes.rows[0]?.count ?? '0', 10) || null;

    // verdict_accuracy_7d: HIT / (HIT + MISS) over last 7 days
    const accuracyRes = await query<{ hits: string; total: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE verdict = 'HIT') AS hits,
         COUNT(*) FILTER (WHERE verdict IN ('HIT', 'MISS')) AS total
       FROM ledger_outcomes
       WHERE created_at >= NOW() - INTERVAL '7 days'`,
      []
    );
    const hits = parseInt(accuracyRes.rows[0]?.hits ?? '0', 10);
    const total = parseInt(accuracyRes.rows[0]?.total ?? '0', 10);
    const verdict_accuracy_7d = total > 0 ? Math.round((hits / total) * 1000) / 1000 : null;

    // active_users_24h: distinct users with last_sign_in_at in past 24h
    const usersRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM auth.users
       WHERE last_sign_in_at >= NOW() - INTERVAL '24 hours'`,
      []
    );
    const active_users_24h = parseInt(usersRes.rows[0]?.count ?? '0', 10) || null;

    return json(
      {
        active_patterns,
        verdict_accuracy_7d,
        active_users_24h,
        cached_at: new Date().toISOString()
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=30'
        }
      }
    );
  } catch (err) {
    console.warn('[api/landing/stats] db error, returning mock:', (err as Error).message);
    // Return mock so the strip is always visible on landing
    return json(
      {
        active_patterns: 52,
        verdict_accuracy_7d: 0.673,
        active_users_24h: 143,
        cached_at: new Date().toISOString()
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=30'
        }
      }
    );
  }
};
