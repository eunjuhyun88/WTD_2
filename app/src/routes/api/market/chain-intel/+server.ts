import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ChainIntelSnapshot } from '$lib/contracts/facts/chainIntel';
import { fetchChainIntel } from '$lib/server/chainIntel';
import { fetchFactChainIntelProxy } from '$lib/server/enginePlanes/facts';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';

const VALID_ADDRESS = /^[A-Za-z0-9]{20,120}$/;
const VALID_CHAIN = /^[A-Za-z0-9_-]{2,32}$/;
const VALID_CHAIN_ID = /^\d{1,10}$/;

function defaultFactSymbolForChain(chain: string): string {
  if (chain === 'solana') return 'SOLUSDT';
  if (chain === 'tron') return 'TRXUSDT';
  return 'BTCUSDT';
}

function adaptFactCoverage(snapshot: ChainIntelSnapshot | null) {
  if (!snapshot?.ok) return null;
  return {
    owner: snapshot.owner,
    plane: snapshot.plane,
    kind: snapshot.kind,
    status: snapshot.status,
    generatedAt: snapshot.generated_at,
    symbol: snapshot.symbol ?? null,
    timeframe: snapshot.timeframe ?? null,
    chain: snapshot.chain ?? null,
    family: snapshot.family ?? null,
    providerState: snapshot.provider_state ?? null,
    summary: snapshot.summary ?? null,
  };
}

export const GET: RequestHandler = async ({ url, request, getClientAddress, fetch }) => {
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
    const [payload, factCoverage] = await Promise.all([
      fetchChainIntel({
        chain,
        entity,
        address,
        chainId,
      }),
      fetchFactChainIntelProxy(fetch, {
        symbol: defaultFactSymbolForChain(chain),
        chain,
        timeframe: '1h',
        offline: true,
      }),
    ]);
    const adaptedFactCoverage = adaptFactCoverage(factCoverage);

    return json(adaptedFactCoverage ? { ...payload, factCoverage: adaptedFactCoverage } : payload, {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'X-WTD-Plane': 'fact',
        'X-WTD-Upstream': adaptedFactCoverage ? 'facts/chain-intel+live-chain-intel' : 'live-chain-intel',
        'X-WTD-State': adaptedFactCoverage ? 'adapter' : 'fallback',
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
