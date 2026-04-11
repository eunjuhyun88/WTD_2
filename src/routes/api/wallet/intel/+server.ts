import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeWalletModeInput } from '$lib/wallet-intel/walletIntelController';
import type { WalletIntelApiMeta } from '$lib/wallet-intel/walletIntelTypes';
import { buildWalletIntelServerDataset } from '$lib/server/walletIntelServer';

export const GET: RequestHandler = async ({ url }) => {
  const address = (url.searchParams.get('address') || '').trim();
  const chain = (url.searchParams.get('chain') || 'eth').trim();

  if (!address) {
    return json({ ok: false, error: 'address is required' }, { status: 400 });
  }

  try {
    const input = normalizeWalletModeInput(address, chain);
    const result = await buildWalletIntelServerDataset(input);
    return json(
      {
        ok: true,
        data: result.data,
        meta: result.meta,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
        },
      }
    );
  } catch (error) {
    console.error('[wallet/intel] failed:', error);
    return json(
      {
        ok: false,
        error: 'failed to build wallet intel dataset',
        meta: {
          source: 'synthetic',
          reason: 'api_failed',
          detail: 'wallet-intel API failed before provider resolution completed.',
        } satisfies WalletIntelApiMeta,
      },
      { status: 500 }
    );
  }
};
