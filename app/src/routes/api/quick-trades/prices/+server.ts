import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toPositiveNumber, UUID_RE } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

interface PriceUpdateItem {
  id: string;
  currentPrice: number;
}

const MAX_EXPLICIT_UPDATES = 400;
const MAX_PRICE_KEYS = 64;

async function applyExplicitUpdates(userId: string, updates: PriceUpdateItem[]) {
  if (!updates.length) return 0;

  // Keep last value per trade id and drop invalid rows.
  const dedup = new Map<string, number>();
  for (const item of updates) {
    if (!UUID_RE.test(item.id)) continue;
    if (!Number.isFinite(item.currentPrice) || item.currentPrice <= 0) continue;
    dedup.set(item.id, item.currentPrice);
  }
  if (dedup.size === 0) return 0;

  const values: string[] = [];
  const params: unknown[] = [userId];
  let p = 2;
  for (const [id, currentPrice] of dedup.entries()) {
    values.push(`($${p}::uuid, $${p + 1}::numeric)`);
    params.push(id, currentPrice);
    p += 2;
  }

  const result = await query<{ updated: string }>(
    `
      WITH incoming(id, current_price) AS (
        VALUES ${values.join(', ')}
      ),
      updated_rows AS (
        UPDATE quick_trades qt
        SET
          current_price = incoming.current_price,
          pnl_percent = ROUND(
            (CASE
              WHEN qt.entry <= 0 THEN 0
              WHEN qt.dir = 'LONG' THEN ((incoming.current_price - qt.entry) / qt.entry) * 100
              ELSE ((qt.entry - incoming.current_price) / qt.entry) * 100
            END)::numeric,
            4
          )
        FROM incoming
        WHERE qt.user_id = $1
          AND qt.status = 'open'
          AND qt.id = incoming.id
        RETURNING 1
      )
      SELECT count(*)::text AS updated FROM updated_rows
    `,
    params
  );

  return Number(result.rows[0]?.updated ?? '0');
}

async function applyTickerMap(userId: string, prices: Record<string, number>) {
  const entries = Object.entries(prices).filter(([, v]) => Number.isFinite(v) && v > 0);
  if (entries.length === 0) return 0;

  const values: string[] = [];
  const params: unknown[] = [userId];
  let p = 2;
  for (const [base, currentPrice] of entries) {
    values.push(`($${p}::text, $${p + 1}::numeric)`);
    params.push(String(base).toUpperCase(), currentPrice);
    p += 2;
  }

  const result = await query<{ updated: string }>(
    `
      WITH incoming(base, current_price) AS (
        VALUES ${values.join(', ')}
      ),
      updated_rows AS (
        UPDATE quick_trades qt
        SET
          current_price = incoming.current_price,
          pnl_percent = ROUND(
            (CASE
              WHEN qt.entry <= 0 THEN 0
              WHEN qt.dir = 'LONG' THEN ((incoming.current_price - qt.entry) / qt.entry) * 100
              ELSE ((qt.entry - incoming.current_price) / qt.entry) * 100
            END)::numeric,
            4
          )
        FROM incoming
        WHERE qt.user_id = $1
          AND qt.status = 'open'
          AND UPPER(split_part(qt.pair::text, '/', 1)) = incoming.base
        RETURNING 1
      )
      SELECT count(*)::text AS updated FROM updated_rows
    `,
    params
  );

  return Number(result.rows[0]?.updated ?? '0');
}

async function handle(cookies: import('@sveltejs/kit').Cookies, request: Request) {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ error: 'Authentication required' }, { status: 401 });

  const body = await request.json();
  const updatesRaw = Array.isArray(body?.updates) ? body.updates : null;
  const pricesRaw = body?.prices && typeof body.prices === 'object' ? body.prices : null;

  if (updatesRaw) {
    if (updatesRaw.length > MAX_EXPLICIT_UPDATES) {
      return json({ error: `Too many updates (max ${MAX_EXPLICIT_UPDATES})` }, { status: 400 });
    }
    const updates: PriceUpdateItem[] = updatesRaw.map((x: any) => ({
      id: typeof x?.id === 'string' ? x.id : '',
      currentPrice: toPositiveNumber(x?.currentPrice, 0),
    }));
    const updated = await applyExplicitUpdates(user.id, updates);
    return json({ success: true, updated });
  }

  if (pricesRaw) {
    const rawEntries = Object.entries(pricesRaw);
    if (rawEntries.length > MAX_PRICE_KEYS) {
      return json({ error: `Too many price keys (max ${MAX_PRICE_KEYS})` }, { status: 400 });
    }
    const normalized: Record<string, number> = {};
    for (const [k, v] of rawEntries) {
      const n = toPositiveNumber(v, 0);
      if (n > 0) normalized[String(k).toUpperCase()] = n;
    }

    const updated = await applyTickerMap(user.id, normalized);
    return json({ success: true, updated });
  }

  return json({ error: 'Either updates[] or prices{} is required' }, { status: 400 });
}

export const PATCH: RequestHandler = async ({ cookies, request }) => {
  try {
    return await handle(cookies, request);
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[quick-trades/prices] unexpected error:', error);
    return json({ error: 'Failed to update trade prices' }, { status: 500 });
  }
};

export const POST = PATCH;
