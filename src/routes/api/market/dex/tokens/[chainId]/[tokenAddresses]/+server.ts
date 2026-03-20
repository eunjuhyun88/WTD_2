import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchDexTokens } from '$lib/server/dexscreener';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const data = await fetchDexTokens(params.chainId, params.tokenAddresses);
    return json(
      {
        ok: true,
        data,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15',
        },
      }
    );
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.startsWith('invalid ')) {
      return json({ error: error.message }, { status: 400 });
    }
    console.error('[market/dex/tokens/:chainId/:tokenAddresses/get] unexpected error:', error);
    return json({ error: 'Failed to load tokens snapshot' }, { status: 500 });
  }
};

