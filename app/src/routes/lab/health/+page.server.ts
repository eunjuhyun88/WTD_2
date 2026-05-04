import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const params = url.searchParams.toString();
  const target = params ? `/settings/status?${params}` : '/settings/status';
  redirect(301, target);
};
