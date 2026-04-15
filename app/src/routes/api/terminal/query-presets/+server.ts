import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import {
  deriveTerminalPresets,
  getCachedTerminalParitySnapshot,
} from '$lib/server/terminalParity';
import { getHotCached } from '$lib/server/hotCache';

const TERMINAL_PRESETS_TTL_MS = 15_000;

export const GET: RequestHandler = async ({ fetch, getClientAddress, request }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: terminalReadLimiter,
    scope: 'terminal:query-presets',
    max: 20,
    tooManyMessage: 'Too many preset requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  const presets = await getHotCached('terminal:query-presets', TERMINAL_PRESETS_TTL_MS, async () => {
    const snapshot = await getCachedTerminalParitySnapshot({
      fetcher: fetch,
      alertsLimit: 48,
      opportunityLimit: 15,
      ttlMs: TERMINAL_PRESETS_TTL_MS,
    });

    return deriveTerminalPresets({
      alerts: snapshot.alerts,
      opportunityAlerts: snapshot.opportunityAlerts,
      patternCandidates: snapshot.patternCandidates,
    });
  });

  return json(
    {
      ok: true,
      presets,
      updatedAt: Date.now(),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=15',
      },
    },
  );
};
