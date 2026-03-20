import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchDexTokenBoostsLatest, fetchDexTokenBoostsTop } from '$lib/server/dexscreener';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const limit = url.searchParams.get('limit');
    const modeRaw = url.searchParams.get('mode');
    const mode = modeRaw?.toLowerCase() === 'top' ? 'top' : 'latest';

    const records = mode === 'top'
      ? await fetchDexTokenBoostsTop(limit ?? undefined)
      : await fetchDexTokenBoostsLatest(limit ?? undefined);

    return json(
      {
        ok: true,
        data: { mode, records },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30',
        },
      }
    );
  } catch (error: unknown) {
    console.error('[market/dex/token-boosts/get] unexpected error:', error);
    return json({ error: 'Failed to load token boosts' }, { status: 500 });
  }
};

