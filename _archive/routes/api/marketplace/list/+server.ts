// ═══════════════════════════════════════════════════════════════
// COGOCHI — Marketplace List API
// GET: Browse active agent listings with filters
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { query } from '$lib/server/db.js';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const plan = url.searchParams.get('plan');
    const archetype = url.searchParams.get('archetype');
    const minWinRate = parseFloat(url.searchParams.get('minWinRate') ?? '0');
    const maxPrice = parseFloat(url.searchParams.get('maxPrice') ?? '999999');
    const sortBy = url.searchParams.get('sort') ?? 'win_rate';
    const limit = Math.min(50, parseInt(url.searchParams.get('limit') ?? '20', 10));
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    const conditions: string[] = ['active = true'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (plan) {
      conditions.push(`plan = $${paramIdx++}`);
      params.push(plan);
    }
    if (archetype) {
      conditions.push(`archetype = $${paramIdx++}`);
      params.push(archetype);
    }
    if (minWinRate > 0) {
      conditions.push(`win_rate >= $${paramIdx++}`);
      params.push(minWinRate);
    }
    if (maxPrice < 999999) {
      conditions.push(`price_usd <= $${paramIdx++}`);
      params.push(maxPrice);
    }

    const validSorts = ['win_rate', 'price_usd', 'total_battles', 'sharpe_ratio', 'created_at'];
    const orderCol = validSorts.includes(sortBy) ? sortBy : 'win_rate';
    const orderDir = sortBy === 'price_usd' ? 'ASC' : 'DESC';

    params.push(limit, offset);

    const result = await query(
      `SELECT id, agent_id, user_id, plan, price_usd, archetype,
              total_battles, win_rate, sharpe_ratio, max_drawdown,
              active_renters, max_renters, description, track_record_hash,
              created_at
       FROM agent_listings
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderCol} ${orderDir} NULLS LAST
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params,
    );

    // Count total
    const countResult = await query(
      `SELECT COUNT(*)::INTEGER as total FROM agent_listings WHERE ${conditions.join(' AND ')}`,
      params.slice(0, -2),
    );

    return json({
      success: true,
      data: result.rows,
      total: countResult.rows[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('[api/marketplace/list] GET error:', err);
    return json({ error: 'Failed to list agents' }, { status: 500 });
  }
};
