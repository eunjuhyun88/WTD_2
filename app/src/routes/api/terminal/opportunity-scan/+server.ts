// ═══════════════════════════════════════════════════════════════
// Opportunity Scan API
// ═══════════════════════════════════════════════════════════════
// Multi-asset scan: scores trending coins → ranked opportunities
// Stores results in DB for history tracking
//
// 1000-user safety:
//   - Server-side result caching (60s TTL)
//   - Request coalescing: concurrent callers share one in-flight scan
//   - DB persist is best-effort & non-blocking

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import { opportunityScanLimiter } from '$lib/server/rateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { getOrRunOpportunityScan } from '$lib/server/opportunityScan';

// ── Handler ──────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, getClientAddress, request }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: opportunityScanLimiter,
    scope: 'terminal:opportunity-scan',
    max: 12,
    tooManyMessage: 'Too many opportunity scan requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 15, 5), 30);

  try {
    const { payload, cacheStatus } = await getOrRunOpportunityScan(limit);
    const { result, alerts } = payload;

    return json(
      {
        success: true,
        ok: true,
        data: {
          coins: result.coins.slice(0, limit),
          macroBackdrop: result.macroBackdrop,
          alerts,
          scannedAt: result.scannedAt,
          scanDurationMs: result.scanDurationMs,
        },
      },
      {
        headers: buildPublicCacheHeaders({
          browserMaxAge: 15,
          sharedMaxAge: 60,
          staleWhileRevalidate: 60,
          cacheStatus,
        }),
      }
    );
  } catch (error: unknown) {
    console.error('[opportunity-scan] error:', error);
    return json({ error: 'Opportunity scan failed' }, { status: 500 });
  }
};
