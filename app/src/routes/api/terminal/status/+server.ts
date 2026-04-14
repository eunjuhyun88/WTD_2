import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchBtcDominance } from '$lib/server/marketDataService';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import {
  deriveTerminalPresets,
  fetchInternalJson,
  type TerminalAlertPreview,
  type TerminalOpportunityPayload,
  type TerminalPatternCandidatesPayload,
  type TerminalScannerStatusPayload,
} from '$lib/server/terminalParity';

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

  const [scannerStatus, alertsPayload, patternCandidates, opportunityPayload, btcDominance] = await Promise.all([
    fetchInternalJson<TerminalScannerStatusPayload>(fetch, '/api/engine/scanner/status'),
    fetchInternalJson<{ alerts?: TerminalAlertPreview[] }> (fetch, '/api/cogochi/alerts?limit=24'),
    fetchInternalJson<TerminalPatternCandidatesPayload>(fetch, '/api/engine/patterns/candidates'),
    fetchInternalJson<TerminalOpportunityPayload>(fetch, '/api/terminal/opportunity-scan?limit=12'),
    fetchBtcDominance(),
  ]);

  const alerts = alertsPayload?.alerts ?? [];
  const opportunityAlerts = opportunityPayload?.data?.alerts ?? [];
  const presets = deriveTerminalPresets({
    alerts,
    opportunityAlerts,
    patternCandidates: patternCandidates?.entry_candidates ?? {},
  });

  return json(
    {
      ok: true,
      data: {
        regime: {
          label: opportunityPayload?.data?.macroBackdrop?.regime ?? 'neutral',
          score: opportunityPayload?.data?.macroBackdrop?.overallMacroScore ?? 0,
        },
        btcDominance: {
          value: btcDominance,
        },
        scanner: {
          running: scannerStatus?.running ?? false,
          nextScan: scannerStatus?.next_scan ?? null,
          intervalSeconds: scannerStatus?.interval_seconds ?? null,
          universe: scannerStatus?.universe ?? null,
        },
        presets,
        alertCount: alerts.length,
        anomalyCount: opportunityAlerts.length,
        scannedAt: opportunityPayload?.data?.scannedAt ?? Date.now(),
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=15',
      },
    },
  );
};
