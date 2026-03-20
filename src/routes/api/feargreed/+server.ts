import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toBoundedInt } from '$lib/server/apiValidation';
import { fetchFearGreed } from '$lib/server/feargreed';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const limit = toBoundedInt(url.searchParams.get('limit'), 30, 1, 365);
    const snapshot = await fetchFearGreed(limit);

    if (!snapshot.current) {
      return json({ error: 'Fear & Greed source unavailable' }, { status: 502 });
    }

    const payload = {
      current: snapshot.current,
      history: snapshot.points,
      count: snapshot.points.length,
    };

    return json(
      {
        success: true,
        ok: true,
        ...payload,
        data: payload,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
        },
      }
    );
  } catch (error) {
    console.error('[feargreed/get] unexpected error:', error);
    return json({ error: 'Failed to load fear & greed data' }, { status: 500 });
  }
};
