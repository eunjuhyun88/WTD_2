// ═══════════════════════════════════════════════════════════════
// COGOCHI — Marketplace Subscribe API
// POST: Subscribe to an agent listing
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { query, withTransaction } from '$lib/server/db.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { userId, listingId, durationDays } = body;

    if (!userId || !listingId) {
      return json({ error: 'userId and listingId required' }, { status: 400 });
    }

    const days = Math.max(7, Math.min(365, durationDays ?? 30));

    // Use transaction for atomic renter count update
    const result = await withTransaction(async (client) => {
      // Check listing
      const listing = await client.query(
        `SELECT id, plan, price_usd, max_renters, active_renters, active, user_id
         FROM agent_listings WHERE id = $1`,
        [listingId],
      );

      if (listing.rows.length === 0) {
        return { error: 'Listing not found', status: 404 };
      }

      const l = listing.rows[0];

      if (!l.active) {
        return { error: 'Listing is not active', status: 400 };
      }

      if (l.user_id === userId) {
        return { error: 'Cannot subscribe to your own agent', status: 400 };
      }

      if (l.active_renters >= l.max_renters) {
        return { error: 'Maximum renters reached', status: 400 };
      }

      // Check existing active subscription
      const existing = await client.query(
        `SELECT id FROM subscriptions
         WHERE listing_id = $1 AND renter_id = $2 AND status = 'active'`,
        [listingId, userId],
      );

      if (existing.rows.length > 0) {
        return { error: 'Already subscribed', status: 409 };
      }

      // Calculate payment (pro-rated for days)
      const monthlyPrice = parseFloat(l.price_usd);
      const amountPaid = (monthlyPrice / 30) * days;

      // Create subscription
      const sub = await client.query(
        `INSERT INTO subscriptions (listing_id, renter_id, plan, amount_paid, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 day' * $5)
         RETURNING id, expires_at`,
        [listingId, userId, l.plan, amountPaid.toFixed(2), days],
      );

      // Increment renter count
      await client.query(
        `UPDATE agent_listings SET active_renters = active_renters + 1, updated_at = NOW()
         WHERE id = $1`,
        [listingId],
      );

      return {
        success: true,
        subscriptionId: sub.rows[0]?.id,
        expiresAt: sub.rows[0]?.expires_at,
        amountPaid: amountPaid.toFixed(2),
        plan: l.plan,
      };
    });

    if ('error' in result) {
      return json({ error: result.error }, { status: result.status ?? 500 });
    }

    return json(result);
  } catch (err: any) {
    console.error('[api/marketplace/subscribe] POST error:', err);
    return json({ error: 'Failed to subscribe' }, { status: 500 });
  }
};
