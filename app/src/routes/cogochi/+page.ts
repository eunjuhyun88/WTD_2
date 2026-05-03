import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
  const legacy = url.searchParams.get('cogochi_legacy') === '1';
  return { legacy };
};
