import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchFredMacroData, hasFredKey } from '$lib/server/fred';
import { fetchYahooSeries } from '$lib/server/yahooFinance';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import { getHotCached } from '$lib/server/hotCache';
import { TerminalPersistenceSchemaVersion } from '$lib/contracts/terminalPersistence';

function nextWeekdayUtc(hour: number, minute: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCHours(hour, minute, 0, 0);
  while (next.getTime() <= now.getTime() || next.getUTCDay() === 0 || next.getUTCDay() === 6) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(hour, minute, 0, 0);
  }
  return next;
}

function nextDailyUtc(hour: number, minute: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function secondsUntil(target: Date): number {
  return Math.max(0, Math.round((target.getTime() - Date.now()) / 1000));
}

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
    const payload = await getHotCached('market:macro-calendar', 60_000, async () => {
      const [fred, dxy, spx, us10y] = await Promise.all([
        hasFredKey() ? fetchFredMacroData() : Promise.resolve(null),
        fetchYahooSeries('DX-Y.NYB', '1mo', '1d'),
        fetchYahooSeries('^GSPC', '1mo', '1d'),
        fetchYahooSeries('^TNX', '1mo', '1d'),
      ]);
      const usOpen = nextWeekdayUtc(13, 30);
      const asiaOpen = nextDailyUtc(0, 0);
      const macroFix = nextDailyUtc(12, 30);

      return {
        ok: true,
        schemaVersion: TerminalPersistenceSchemaVersion,
        items: [
          {
            id: 'macro-us-cash-open',
            title: 'US Cash Open',
            scheduledAt: usOpen.toISOString(),
            countdownSeconds: secondsUntil(usOpen),
            impact: 'high' as const,
            affectedAssets: ['BTC', 'ETH', 'SPX', 'DXY'],
            summary: `DXY ${dxy?.regularMarketPrice?.toFixed?.(2) ?? 'n/a'} · SPX ${spx?.regularMarketPrice?.toFixed?.(0) ?? 'n/a'} · US10Y ${us10y?.regularMarketPrice?.toFixed?.(2) ?? 'n/a'}`,
          },
          {
            id: 'macro-asia-reopen',
            title: 'Asia Risk Reopen',
            scheduledAt: asiaOpen.toISOString(),
            countdownSeconds: secondsUntil(asiaOpen),
            impact: 'medium' as const,
            affectedAssets: ['BTC', 'ETH', 'JPY', 'CNH'],
            summary: `Use overnight flow reset against current DXY trend ${dxy?.regularMarketChangePercent != null ? `${dxy.regularMarketChangePercent.toFixed(2)}%` : 'n/a'}.`,
          },
          {
            id: 'macro-liquidity-fix',
            title: 'Macro Liquidity Fix',
            scheduledAt: macroFix.toISOString(),
            countdownSeconds: secondsUntil(macroFix),
            impact: 'medium' as const,
            affectedAssets: ['BTC', 'ETH', 'DXY', 'Rates'],
            summary: fred?.yieldCurve?.latest?.value != null
              ? `Fed ${fred.fedFundsRate?.latest?.value ?? 'n/a'} · Curve ${fred.yieldCurve.latest.value} · CPI ${fred.cpi?.changePct ?? 'n/a'}%.`
              : 'Live macro route active; FRED key not configured, using market indicator backdrop.',
          },
        ],
        updatedAt: new Date().toISOString(),
      };
    });

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
