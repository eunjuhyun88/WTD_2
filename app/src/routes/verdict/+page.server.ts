import type { PageServerLoad } from './$types';
import { evaluateToken } from '$lib/server/verdictToken';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });
  return evaluateToken(url.searchParams.get('token'));
};
