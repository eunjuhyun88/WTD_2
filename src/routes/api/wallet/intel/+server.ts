import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeWalletModeInput } from '$lib/wallet-intel/walletIntelController';
import { buildWalletIntelServerDataset } from '$lib/server/walletIntelServer';

export const GET: RequestHandler = async ({ url }) => {
  const address = (url.searchParams.get('address') || '').trim();
  const chain = (url.searchParams.get('chain') || 'eth').trim();

  if (!address) {
    return json({ error: 'address is required' }, { status: 400 });
  }

  try {
    const input = normalizeWalletModeInput(address, chain);
    const data = await buildWalletIntelServerDataset(input);
    return json(
      {
        ok: true,
        data,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
        },
      }
    );
  } catch (error) {
    console.error('[wallet/intel] failed:', error);
    return json({ error: 'failed to build wallet intel dataset' }, { status: 500 });
  }
};
