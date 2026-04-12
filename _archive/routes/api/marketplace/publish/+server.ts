// ═══════════════════════════════════════════════════════════════
// COGOCHI — Marketplace Publish API
// POST: Publish an agent to the marketplace
// Requirements: min 30 battles, win rate > 50%
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { query } from '$lib/server/db.js';

const MIN_BATTLES = 30;
const MIN_WIN_RATE = 0.50;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { userId, agentId, plan, priceUsd, description } = body;

    if (!userId || !agentId || !plan || !priceUsd) {
      return json({ error: 'userId, agentId, plan, priceUsd required' }, { status: 400 });
    }

    if (!['SIGNAL', 'AUTO', 'PREMIUM'].includes(plan)) {
      return json({ error: 'plan must be SIGNAL, AUTO, or PREMIUM' }, { status: 400 });
    }

    if (priceUsd <= 0 || priceUsd > 10000) {
      return json({ error: 'priceUsd must be between 0 and 10000' }, { status: 400 });
    }

    // Check agent stats from agent_memories (battle count)
    const statsResult = await query<{ total: number; wins: number }>(
      `SELECT
         COUNT(*)::INTEGER as total,
         COUNT(*) FILTER (WHERE outcome = 'WIN')::INTEGER as wins
       FROM agent_memories
       WHERE agent_id = $1 AND kind IN ('SUCCESS_CASE','FAILURE_CASE')`,
      [agentId],
    );

    const stats = statsResult.rows[0] ?? { total: 0, wins: 0 };
    const winRate = stats.total > 0 ? stats.wins / stats.total : 0;

    if (stats.total < MIN_BATTLES) {
      return json({
        error: `Need at least ${MIN_BATTLES} battles, have ${stats.total}`,
      }, { status: 400 });
    }

    if (winRate < MIN_WIN_RATE) {
      return json({
        error: `Win rate must be >${MIN_WIN_RATE * 100}%, current: ${(winRate * 100).toFixed(1)}%`,
      }, { status: 400 });
    }

    // Check for existing active listing
    const existing = await query(
      `SELECT id FROM agent_listings WHERE agent_id = $1 AND user_id = $2 AND active = true`,
      [agentId, userId],
    );

    if (existing.rows.length > 0) {
      return json({ error: 'Agent already listed. Delist first.' }, { status: 409 });
    }

    // Get doctrine archetype
    const doctrine = await query<{ archetype: string }>(
      `SELECT archetype FROM doctrines WHERE agent_id = $1 AND user_id = $2 AND active = true LIMIT 1`,
      [agentId, userId],
    );

    // Create listing
    const result = await query<{ id: string }>(
      `INSERT INTO agent_listings (
        agent_id, user_id, plan, price_usd, archetype,
        total_battles, win_rate, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        agentId, userId, plan, priceUsd,
        doctrine.rows[0]?.archetype ?? null,
        stats.total, winRate,
        description ?? null,
      ],
    );

    return json({
      success: true,
      listingId: result.rows[0]?.id,
      stats: { totalBattles: stats.total, winRate },
    });
  } catch (err: any) {
    console.error('[api/marketplace/publish] POST error:', err);
    return json({ error: 'Failed to publish agent' }, { status: 500 });
  }
};
