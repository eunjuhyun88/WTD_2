// ═══════════════════════════════════════════════════════════════
// Stockclaw — Polymarket Order Submit API
// ═══════════════════════════════════════════════════════════════
// Step 2 of 2-step order flow:
//   Frontend sends positionId + wallet signature →
//   Backend forwards signed order to Polymarket CLOB
//
// POST /api/positions/polymarket/submit
// Body: { positionId, signature }
// Returns: { clobOrderId, orderStatus }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { submitSignedOrder, type L2Credentials } from '$lib/server/polymarketClob';
import { polymarketOrderLimiter } from '$lib/server/rateLimit';
import { decryptSecret } from '$lib/server/secretCrypto';

const EIP712_SIG_RE = /^0x[0-9a-f]{130,}$/i;

export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  const ip = getClientAddress();
  if (!polymarketOrderLimiter.check(ip)) {
    return json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'Invalid request body' }, { status: 400 });

    const { positionId, signature } = body;

    if (typeof positionId !== 'string' || !positionId) {
      return json({ error: 'positionId is required' }, { status: 400 });
    }
    if (typeof signature !== 'string' || !EIP712_SIG_RE.test(signature)) {
      return json({ error: 'Invalid signature format' }, { status: 400 });
    }

    // Fetch position from DB
    const posResult = await query(
      `SELECT * FROM polymarket_positions
       WHERE id = $1 AND user_id = $2 AND order_status = 'pending_signature'`,
      [positionId, user.id],
    );
    const pos = posResult.rows[0];
    if (!pos) {
      return json({ error: 'Position not found or already submitted' }, { status: 404 });
    }

    // Check expiration (position should be submitted within 5 minutes of creation)
    const createdAt = new Date(pos.created_at).getTime();
    if (Date.now() - createdAt > 5 * 60 * 1000) {
      await query(
        `UPDATE polymarket_positions SET order_status = 'failed', updated_at = now()
         WHERE id = $1`,
        [positionId],
      );
      return json({ error: 'Order expired. Please create a new order.' }, { status: 410 });
    }

    // Get user's L2 credentials (stored in DB from auth step)
    const credResult = await query(
      `SELECT poly_api_key, poly_secret, poly_passphrase
       FROM users WHERE id = $1`,
      [user.id],
    );
    const creds = credResult.rows[0];
    let apiKey: string | null = null;
    let secret: string | null = null;
    let passphrase: string | null = null;
    try {
      apiKey = decryptSecret(creds?.poly_api_key ?? null);
      secret = decryptSecret(creds?.poly_secret ?? null);
      passphrase = decryptSecret(creds?.poly_passphrase ?? null);
    } catch {
      return json({ error: 'Server secret encryption key mismatch' }, { status: 503 });
    }

    // If no L2 credentials, we can't submit to CLOB
    // The user needs to complete Polymarket auth first
    if (!apiKey || !secret || !passphrase) {
      return json({
        error: 'Polymarket authentication required. Please connect your wallet to Polymarket first.',
        code: 'POLY_AUTH_REQUIRED',
      }, { status: 403 });
    }

    const l2Creds: L2Credentials = {
      apiKey,
      secret,
      passphrase,
    };

    // Build ClobOrder from DB fields
    const clobOrder = {
      salt: pos.nonce ?? '0', // we stored salt as nonce in prepare step
      maker: pos.wallet_address,
      signer: pos.wallet_address,
      taker: '0x0000000000000000000000000000000000000000',
      tokenId: pos.token_id,
      makerAmount: String(Math.round(Number(pos.amount_usdc) * 1e6)),
      takerAmount: String(Math.round(Number(pos.size) * 1e6)),
      expiration: String(Math.floor(createdAt / 1000) + 300),
      nonce: '0',
      feeRateBps: '200',
      side: pos.side === 'BUY' ? 0 : 1,
      signatureType: 0,
    };

    // Submit to CLOB
    const result = await submitSignedOrder(clobOrder, signature, l2Creds, pos.wallet_address);

    if (!result.success) {
      await query(
        `UPDATE polymarket_positions SET order_status = 'failed', updated_at = now()
         WHERE id = $1`,
        [positionId],
      );
      return json({ error: result.error ?? 'CLOB submission failed' }, { status: 502 });
    }

    // Update DB with CLOB order ID
    await query(
      `UPDATE polymarket_positions
       SET clob_order_id = $1, order_status = 'submitted', signature = $2, updated_at = now()
       WHERE id = $3`,
      [result.orderID, signature, positionId],
    );

    // Log activity
    await query(
      `INSERT INTO activity_events (user_id, event_type, source_page, severity, payload)
       VALUES ($1, 'polymarket_order_placed', 'terminal', 'info', $2::jsonb)`,
      [
        user.id,
        JSON.stringify({
          positionId,
          clobOrderId: result.orderID,
          direction: pos.direction,
          amountUsdc: pos.amount_usdc,
          price: pos.price,
        }),
      ],
    ).catch(() => undefined);

    return json({
      ok: true,
      clobOrderId: result.orderID,
      orderStatus: 'submitted',
    });
  } catch (error: unknown) {
    console.error('[positions/polymarket/submit] error:', error);
    return json({ error: 'Failed to submit order' }, { status: 500 });
  }
};
