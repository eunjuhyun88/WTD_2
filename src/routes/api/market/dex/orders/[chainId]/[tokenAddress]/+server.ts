import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchDexOrders } from '$lib/server/dexscreener';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const data = await fetchDexOrders(params.chainId, params.tokenAddress);
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
    console.error('[market/dex/orders/:chainId/:tokenAddress/get] unexpected error:', error);
    return json({ error: 'Failed to load dex orders' }, { status: 500 });
  }
};

