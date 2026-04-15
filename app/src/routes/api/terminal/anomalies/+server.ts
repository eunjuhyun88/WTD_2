import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import {
  deriveTerminalAnomalies,
  getCachedTerminalParitySnapshot,
} from '$lib/server/terminalParity';
import { getHotCached } from '$lib/server/hotCache';

const TERMINAL_ANOMALIES_TTL_MS = 15_000;

export const GET: RequestHandler = async ({ fetch, getClientAddress, request, url }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: terminalReadLimiter,
    scope: 'terminal:anomalies',
    max: 20,
    tooManyMessage: 'Too many anomaly requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  const limitRaw = Number(url.searchParams.get('limit') ?? '12');
  const limit = Math.min(Math.max(1, limitRaw), 24);

  const anomalies = await getHotCached(`terminal:anomalies:${limit}`, TERMINAL_ANOMALIES_TTL_MS, async () => {
    const snapshot = await getCachedTerminalParitySnapshot({
      fetcher: fetch,
      alertsLimit: 48,
      opportunityLimit: 15,
      ttlMs: TERMINAL_ANOMALIES_TTL_MS,
    });

    return deriveTerminalAnomalies({
      alerts: snapshot.alerts,
      opportunityAlerts: snapshot.opportunityAlerts,
    }).slice(0, limit);
  });

  return json(
    {
      ok: true,
      anomalies,
      updatedAt: Date.now(),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=15',
      },
    },
  );
};
