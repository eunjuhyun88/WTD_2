// ═══════════════════════════════════════════════════════════════
// Stockclaw — Polymarket Order Prepare API
// ═══════════════════════════════════════════════════════════════
// Step 1 of 2-step order flow:
//   Frontend sends trade params → Backend validates + builds EIP-712
//   typed data → Returns typed data for wallet signing
//
// POST /api/positions/polymarket/prepare
// Body: { marketId, direction, price, amount, walletAddress }
// Returns: { positionId, typedData, orderParams }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { prepareOrder, getOrderbook } from '$lib/server/polymarketClob';
import { polymarketOrderLimiter } from '$lib/server/rateLimit';

const ETH_ADDRESS_RE = /^0x[0-9a-f]{40}$/i;

export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  // Rate limit
  const ip = getClientAddress();
  if (!polymarketOrderLimiter.check(ip)) {
    return json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  try {
    // Auth
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'Invalid request body' }, { status: 400 });

    // Validate inputs
    const { marketId, direction, price, amount, walletAddress } = body;

    if (typeof marketId !== 'string' || !marketId.trim()) {
      return json({ error: 'marketId is required' }, { status: 400 });
    }

    const dir = typeof direction === 'string' ? direction.toUpperCase() : '';
    if (dir !== 'YES' && dir !== 'NO') {
      return json({ error: 'direction must be YES or NO' }, { status: 400 });
    }

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0 || priceNum >= 1) {
      return json({ error: 'price must be between 0.01 and 0.99' }, { status: 400 });
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 1) {
      return json({ error: 'amount must be at least 1 USDC' }, { status: 400 });
    }
    if (amountNum > 10000) {
      return json({ error: 'amount cannot exceed 10,000 USDC' }, { status: 400 });
    }

    if (typeof walletAddress !== 'string' || !ETH_ADDRESS_RE.test(walletAddress)) {
      return json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    // Prepare order (fetches market, calculates amounts, builds EIP-712)
    const prepared = await prepareOrder({
      marketId: marketId.trim(),
      direction: dir as 'YES' | 'NO',
      price: priceNum,
      amountUsdc: amountNum,
      walletAddress,
    });

    if (!prepared) {
      return json({ error: 'Market not found or inactive' }, { status: 404 });
    }

    // Insert position into DB
    const insertResult = await query(
      `INSERT INTO polymarket_positions (
        user_id, market_id, market_title, market_slug, token_id,
        direction, side, price, size, amount_usdc,
        order_status, wallet_address, nonce
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        user.id,
        marketId.trim(),
        '', // market_title — filled on submit
        '', // market_slug
        prepared.order.tokenId,
        dir,
        'BUY',
        priceNum,
        prepared.size,
        amountNum,
        'pending_signature',
        walletAddress,
        prepared.order.nonce,
      ],
    );

    const positionId = insertResult.rows[0]?.id;

    return json({
      ok: true,
      positionId,
      typedData: prepared.typedData,
      orderParams: {
        tokenId: prepared.order.tokenId,
        side: 'BUY',
        price: priceNum,
        size: prepared.size,
        salt: prepared.order.salt,
        nonce: prepared.order.nonce,
        expiration: prepared.order.expiration,
        feeRateBps: Number(prepared.order.feeRateBps),
      },
    });
  } catch (error: unknown) {
    console.error('[positions/polymarket/prepare] error:', error);
    return json({ error: 'Failed to prepare order' }, { status: 500 });
  }
};
