import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchDexPairs } from '$lib/server/dexscreener';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const q = url.searchParams.get('q') ?? '';
    if (!q.trim()) {
      return json({ error: 'q is required' }, { status: 400 });
    }

    const data = await searchDexPairs(q);
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
    if (typeof error?.message === 'string' && error.message.includes('query is required')) {
      return json({ error: error.message }, { status: 400 });
    }
    console.error('[market/dex/search/get] unexpected error:', error);
    return json({ error: 'Failed to search dex pairs' }, { status: 500 });
  }
};

