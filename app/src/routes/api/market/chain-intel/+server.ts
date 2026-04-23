import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchChainIntel } from '$lib/server/chainIntel';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';

const VALID_ADDRESS = /^[A-Za-z0-9]{20,120}$/;
const VALID_CHAIN = /^[A-Za-z0-9_-]{2,32}$/;
const VALID_CHAIN_ID = /^\d{1,10}$/;

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const chain = (url.searchParams.get('chain') ?? 'solana').toLowerCase();
  const chainId = url.searchParams.get('chainid')?.trim() ?? null;
  const defaultEntity = chain === 'solana' ? 'token' : 'account';
  const entity = (url.searchParams.get('entity') ?? defaultEntity).toLowerCase();
  const address = url.searchParams.get('address')?.trim() ?? null;

  if (!VALID_CHAIN.test(chain)) {
    return json({ error: 'invalid chain' }, { status: 400 });
  }
  if (entity !== 'token' && entity !== 'account') {
    return json({ error: 'invalid entity' }, { status: 400 });
  }
  if (address && !VALID_ADDRESS.test(address)) {
    return json({ error: 'invalid address' }, { status: 400 });
  }
  if (chainId && !VALID_CHAIN_ID.test(chainId)) {
    return json({ error: 'invalid chainid' }, { status: 400 });
  }

  const ip = getRequestIp({ request, getClientAddress });
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    const payload = await fetchChainIntel({
      chain,
      entity,
      address,
      chainId,
    });

    return json(payload, {
      headers: {
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'address_required') {
      return json({ error: 'address required for this chain/entity' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'unsupported_chain') {
      return json({ error: 'unsupported chain' }, { status: 400 });
    }
    console.error('[api/market/chain-intel] error:', error);
    return json({ error: 'failed to build chain intel payload' }, { status: 500 });
  }
};
