// ═══════════════════════════════════════════════════════════════
// Stockclaw — GMX V2 Order Confirm API
// ═══════════════════════════════════════════════════════════════
// POST /api/gmx/confirm
// After user sends the transaction from their wallet, frontend
// sends the txHash here so we can track it.
//
// Body: { positionId, txHash }
// Returns: { ok: true }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { gmxOrderLimiter } from '$lib/server/rateLimit';

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  const ip = getClientAddress();
  if (!gmxOrderLimiter.check(ip)) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { positionId, txHash } = body;

    if (!positionId || typeof positionId !== 'string') {
      return json({ error: 'Missing positionId' }, { status: 400 });
    }

    if (!txHash || !TX_HASH_RE.test(txHash)) {
      return json({ error: 'Invalid transaction hash' }, { status: 400 });
    }

    // Verify ownership & status
    const check = await query(
      `SELECT id, order_status FROM gmx_positions
       WHERE id = $1 AND user_id = $2`,
      [positionId, user.id]
    );

    if (!check.rows.length) {
      return json({ error: 'Position not found' }, { status: 404 });
    }

    if (check.rows[0].order_status !== 'pending_tx') {
      return json({ error: 'Position already confirmed' }, { status: 409 });
    }

    // Update with tx hash
    await query(
      `UPDATE gmx_positions
       SET tx_hash = $1, order_status = 'tx_sent', updated_at = now()
       WHERE id = $2 AND user_id = $3`,
      [txHash, positionId, user.id]
    );

    return json({ ok: true });
  } catch (err: any) {
    console.error('[GMX confirm] Error:', err);
    return json({ error: err?.message ?? 'Failed to confirm order' }, { status: 500 });
  }
};
