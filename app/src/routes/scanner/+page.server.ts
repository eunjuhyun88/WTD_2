import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const params = new URLSearchParams(url.searchParams);
  // Override/set panel param to scanner shortcode
  params.set('panel', 'scn');
  redirect(301, `/cogochi?${params.toString()}`);
};
