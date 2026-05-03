import type { PageServerLoad } from './$types';
import { evaluateToken } from '$lib/server/verdictToken';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });
  return evaluateToken(params.token);
};
