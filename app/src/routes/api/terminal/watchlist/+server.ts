import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';
import {
  TerminalPersistenceSchemaVersion,
  TerminalWatchlistRequestSchema,
  type TerminalWatchlistItem,
} from '$lib/contracts/terminalPersistence';
import { listTerminalWatchlist, replaceTerminalWatchlist } from '$lib/server/terminalPersistence';
import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';

function derivePreview(payload: AnalyzeEnvelope | null) {
  if (!payload) return undefined;
  const verdict = String(payload.deep?.verdict ?? '').toUpperCase();
  const bias =
    payload.riskPlan?.bias?.includes('bear') || verdict.includes('BEAR')
      ? 'bearish'
      : payload.riskPlan?.bias?.includes('bull') || verdict.includes('BULL')
        ? 'bullish'
        : 'neutral';
  return {
    price: payload.price ?? null,
    change24h: payload.change24h ?? null,
    bias,
    confidence:
      payload.entryPlan?.confidencePct != null && payload.entryPlan.confidencePct >= 68
        ? 'high'
        : payload.entryPlan?.confidencePct != null && payload.entryPlan.confidencePct >= 54
          ? 'medium'
          : 'low',
    action: payload.ensemble?.reason ?? payload.riskPlan?.bias ?? undefined,
    invalidation: payload.riskPlan?.invalidation ?? undefined,
  } as const;
}

async function enrichWatchlist(fetcher: typeof fetch, items: TerminalWatchlistItem[]): Promise<TerminalWatchlistItem[]> {
  return Promise.all(
    items.map(async (item) => {
      try {
        const response = await fetcher(`/api/cogochi/analyze?symbol=${item.symbol}&tf=${item.timeframe}`);
        if (!response.ok) return item;
        const payload = (await response.json()) as AnalyzeEnvelope;
        return { ...item, preview: derivePreview(payload) };
      } catch {
        return item;
      }
    }),
  );
}

export const GET: RequestHandler = async ({ cookies, fetch }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const items = await enrichWatchlist(fetch, await listTerminalWatchlist(user.id));
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      items,
      activeSymbol: items.find((item) => item.active)?.symbol,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/watchlist/get] unexpected error:', error);
    return json({ error: 'Failed to load watchlist' }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ cookies, request, fetch }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = TerminalWatchlistRequestSchema.parse(await request.json());
    const deduped = body.items.filter((item, index, arr) => arr.findIndex((candidate) => candidate.symbol === item.symbol) === index);
    const items = await enrichWatchlist(fetch, await replaceTerminalWatchlist(user.id, deduped, body.activeSymbol));
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      items,
      activeSymbol: body.activeSymbol,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'Invalid watchlist payload' }, { status: 400 });
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/watchlist/put] unexpected error:', error);
    return json({ error: 'Failed to update watchlist' }, { status: 500 });
  }
};
