import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchBtcDominance } from '$lib/server/marketDataService';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import {
  deriveTerminalPresets,
  getCachedTerminalParitySnapshot,
} from '$lib/server/terminalParity';
import { getHotCached } from '$lib/server/hotCache';

const TERMINAL_STATUS_TTL_MS = 15_000;

export const GET: RequestHandler = async ({ fetch, getClientAddress, request }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: terminalReadLimiter,
    scope: 'terminal:status',
    max: 20,
    tooManyMessage: 'Too many terminal status requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  const payload = await getHotCached('terminal:status', TERMINAL_STATUS_TTL_MS, async () => {
    const snapshot = await getCachedTerminalParitySnapshot({
      fetcher: fetch,
      fetchBtcDominance,
      alertsLimit: 24,
      opportunityLimit: 12,
      ttlMs: TERMINAL_STATUS_TTL_MS,
    });
    const presets = deriveTerminalPresets({
      alerts: snapshot.alerts,
      opportunityAlerts: snapshot.opportunityAlerts,
      patternCandidates: snapshot.patternCandidates,
    });

    return {
      regime: {
        label: snapshot.macroBackdrop?.regime ?? 'neutral',
        score: snapshot.macroBackdrop?.overallMacroScore ?? 0,
      },
      btcDominance: {
        value: snapshot.btcDominance,
      },
      scanner: {
        running: snapshot.scannerStatus?.running ?? false,
        nextScan: snapshot.scannerStatus?.next_scan ?? null,
        intervalSeconds: snapshot.scannerStatus?.interval_seconds ?? null,
        universe: snapshot.scannerStatus?.universe ?? null,
      },
      presets,
      alertCount: snapshot.alerts.length,
      anomalyCount: snapshot.opportunityAlerts.length,
      scannedAt: snapshot.scannedAt,
    };
  });

  return json(
    {
      ok: true,
      data: payload,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=15',
      },
    },
  );
};
