import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchDexTokenProfilesLatest } from '$lib/server/dexscreener';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const limit = url.searchParams.get('limit');
    const records = await fetchDexTokenProfilesLatest(limit ?? undefined);
    return json(
      {
        ok: true,
        data: { records },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30',
        },
      }
    );
  } catch (error: unknown) {
    console.error('[market/dex/token-profiles/get] unexpected error:', error);
    return json({ error: 'Failed to load token profiles' }, { status: 500 });
  }
};

