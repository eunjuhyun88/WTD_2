import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import {
  deriveTerminalPresets,
  fetchInternalJson,
  type TerminalAlertPreview,
  type TerminalOpportunityPayload,
  type TerminalPatternCandidatesPayload,
} from '$lib/server/terminalParity';

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

  const [alertsPayload, patternCandidates, opportunityPayload] = await Promise.all([
    fetchInternalJson<{ alerts?: TerminalAlertPreview[] }>(fetch, '/api/cogochi/alerts?limit=48'),
    fetchInternalJson<TerminalPatternCandidatesPayload>(fetch, '/api/engine/patterns/candidates'),
    fetchInternalJson<TerminalOpportunityPayload>(fetch, '/api/terminal/opportunity-scan?limit=15'),
  ]);

  const presets = deriveTerminalPresets({
    alerts: alertsPayload?.alerts ?? [],
    opportunityAlerts: opportunityPayload?.data?.alerts ?? [],
    patternCandidates: patternCandidates?.entry_candidates ?? {},
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
