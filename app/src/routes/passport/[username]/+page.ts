import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  const res = await fetch(`/api/passport/${params.username}`);
  if (!res.ok) return { username: params.username, stats: null };
  const stats = await res.json();
  return { username: params.username, stats };
};
