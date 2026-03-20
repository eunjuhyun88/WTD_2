// ═══════════════════════════════════════════════════════════════
// Stockclaw — GMX Balance & Allowance API
// ═══════════════════════════════════════════════════════════════
// GET /api/gmx/balance?address=0x...
// Returns USDC balance, ETH balance, and approval status.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBalanceInfo } from '$lib/server/gmxV2';
import { gmxReadLimiter } from '$lib/server/rateLimit';

const ETH_ADDRESS_RE = /^0x[0-9a-f]{40}$/i;

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  const ip = getClientAddress();
  if (!gmxReadLimiter.check(ip)) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  const address = url.searchParams.get('address');
  if (!address || !ETH_ADDRESS_RE.test(address)) {
    return json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    const balance = await getBalanceInfo(address);
    return json({ ok: true, ...balance });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Failed to fetch balance' }, { status: 500 });
  }
};
