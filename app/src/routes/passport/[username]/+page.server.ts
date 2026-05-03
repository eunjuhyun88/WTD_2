import type { PageServerLoad } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
  const { username } = params;
  setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=120' });

  try {
    const res = await engineFetch(`/passport/${encodeURIComponent(username)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { username, stats: null };
    const stats = await res.json();
    return { username, stats };
  } catch {
    return { username, stats: null };
  }
};
