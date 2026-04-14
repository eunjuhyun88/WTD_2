import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import {
  deriveTerminalAnomalies,
  fetchInternalJson,
  type TerminalAlertPreview,
  type TerminalOpportunityPayload,
} from '$lib/server/terminalParity';

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

  const [alertsPayload, opportunityPayload] = await Promise.all([
    fetchInternalJson<{ alerts?: TerminalAlertPreview[] }>(fetch, '/api/cogochi/alerts?limit=48'),
    fetchInternalJson<TerminalOpportunityPayload>(fetch, '/api/terminal/opportunity-scan?limit=15'),
  ]);

  const anomalies = deriveTerminalAnomalies({
    alerts: alertsPayload?.alerts ?? [],
    opportunityAlerts: opportunityPayload?.data?.alerts ?? [],
  }).slice(0, limit);

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
