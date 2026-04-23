import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchSupportedChains } from '$lib/server/supportedChains';

const VALID_FAMILY = new Set(['all', 'solana', 'tron', 'evm']);

export const GET: RequestHandler = async ({ url }) => {
  try {
    const q = url.searchParams.get('q') ?? '';
    const family = (url.searchParams.get('family') ?? 'all').toLowerCase();
    const includeTestnets = url.searchParams.get('includeTestnets') === '1';
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : 20;

    if (!VALID_FAMILY.has(family)) {
      return json({ error: 'invalid family' }, { status: 400 });
    }
    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      return json({ error: 'invalid limit' }, { status: 400 });
    }

    const data = await searchSupportedChains({
      q,
      family: family as 'all' | 'solana' | 'tron' | 'evm',
      includeTestnets,
      limit,
    });

    return json(
      {
        ok: true,
        data,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300',
        },
      },
    );
  } catch (error) {
    console.error('[api/market/chains/search] unexpected error:', error);
    return json({ error: 'failed to search supported chains' }, { status: 500 });
  }
};
