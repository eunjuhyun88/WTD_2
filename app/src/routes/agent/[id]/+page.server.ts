import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const { id } = params;

  try {
    const res = await fetch(`/api/agents/stats/${id}`);
    if (res.status === 404) return { agentStats: null, notFound: true };
    if (!res.ok) return { agentStats: null, notFound: false };
    const data = await res.json();
    return { agentStats: data, notFound: false };
  } catch {
    return { agentStats: null, notFound: false };
  }
};
