import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const params = url.searchParams.toString();
  const target = params ? `/cogochi?panel=anl&${params}` : '/cogochi?panel=anl';
  redirect(301, target);
};
