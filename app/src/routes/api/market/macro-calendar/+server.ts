import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import { loadMacroCalendar } from '$lib/server/macroCalendar';

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: terminalReadLimiter,
    scope: 'market:macro-calendar',
    max: 20,
    tooManyMessage: 'Too many macro calendar requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const payload = await loadMacroCalendar();

    return json(payload, {
      headers: buildPublicCacheHeaders({
        browserMaxAge: 30,
        sharedMaxAge: 60,
        staleWhileRevalidate: 120,
      }),
    });
  } catch (error: unknown) {
    console.error('[market/macro-calendar] unexpected error:', error);
    return json({ error: 'Failed to load macro calendar' }, { status: 500 });
  }
};
