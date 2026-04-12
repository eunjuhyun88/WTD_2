import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const qs = new URLSearchParams({
    chain: params.chain,
    address: params.address,
  });

  const response = await fetch(`/api/wallet/intel?${qs.toString()}`);
  if (!response.ok) {
    throw error(response.status, 'Failed to load wallet dossier');
  }

  const payload = await response.json();
  if (!payload?.ok || !payload?.data) {
    throw error(500, 'Invalid wallet dossier payload');
  }

  return {
    dataset: payload.data,
    chain: params.chain,
    address: params.address,
  };
};
