import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeWalletModeInput } from '$lib/wallet-intel/walletIntelController';
import type { WalletIntelApiMeta } from '$lib/wallet-intel/walletIntelTypes';
import { buildWalletIntelServerDataset } from '$lib/server/walletIntelServer';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import { createSharedPublicRouteCache } from '$lib/server/publicRouteCache';
import { walletIntelLimiter } from '$lib/server/rateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';

const CACHE_TTL_MS = 120_000;
const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{8,40}$/;

const walletIntelCache = createSharedPublicRouteCache<{
  ok: true;
  data: Awaited<ReturnType<typeof buildWalletIntelServerDataset>>['data'];
  meta: Awaited<ReturnType<typeof buildWalletIntelServerDataset>>['meta'];
}>({
  scope: 'wallet:intel',
  ttlMs: CACHE_TTL_MS,
});

function cacheKey(address: string, chain: string): string {
  const trimmedAddress = address.trim();
  const normalizedAddress = HEX_ADDRESS_RE.test(trimmedAddress)
    ? trimmedAddress.toLowerCase()
    : trimmedAddress;
  return `${chain.trim().toLowerCase() || 'eth'}:${normalizedAddress}`;
}

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: walletIntelLimiter,
    scope: 'wallet:intel',
    max: 12,
    tooManyMessage: 'Too many wallet intel requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  const address = (url.searchParams.get('address') || '').trim();
  const chain = (url.searchParams.get('chain') || 'eth').trim();

  if (!address) {
    return json({ ok: false, error: 'address is required' }, { status: 400 });
  }

  try {
    const { payload, cacheStatus } = await walletIntelCache.run(cacheKey(address, chain), async () => {
      const input = normalizeWalletModeInput(address, chain);
      const result = await buildWalletIntelServerDataset(input);
      return {
        ok: true as const,
        data: result.data,
        meta: result.meta,
      };
    });

    return json(
      payload,
      {
        headers: buildPublicCacheHeaders({
          browserMaxAge: 30,
          sharedMaxAge: 120,
          staleWhileRevalidate: 60,
          cacheStatus,
        }),
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
