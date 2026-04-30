/**
 * GET  /api/chart/notes?symbol=BTCUSDT&tf=1h  — list notes for symbol+tf
 * POST /api/chart/notes                        — create note
 */
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import {
  listNotes,
  insertNote,
  countNotes,
  normalizeSymbol,
} from '$lib/server/chartNotesRepository';

const FREE_TIER_CAP = 50;
const VALID_TF = new Set(['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w']);
const VALID_TAG = new Set(['idea','entry','exit','mistake','observation']);

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ notes: [] });

  const symbol    = url.searchParams.get('symbol') ?? '';
  const timeframe = url.searchParams.get('tf') ?? '';
  if (!symbol || !VALID_TF.has(timeframe)) {
    return json({ notes: [] });
  }

  const notes = await listNotes(user.id, symbol, timeframe);
  return json({ notes });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { throw error(400, 'Invalid JSON'); }

  const { symbol, timeframe, bar_time, price_at_write, body: noteBody, tag = 'observation' } = body;

  if (typeof symbol !== 'string' || !symbol) throw error(400, 'symbol required');
  if (typeof timeframe !== 'string' || !VALID_TF.has(timeframe)) throw error(400, 'invalid tf');
  if (typeof bar_time !== 'number' || bar_time <= 0) throw error(400, 'invalid bar_time');
  if (typeof price_at_write !== 'number' || price_at_write <= 0) throw error(400, 'invalid price');
  if (typeof noteBody !== 'string' || noteBody.trim().length === 0) throw error(400, 'body required');
  if (noteBody.length > 500) throw error(400, 'body too long (max 500)');
  if (typeof tag !== 'string' || !VALID_TAG.has(tag)) throw error(400, 'invalid tag');

  // Free tier cap: check count (pro = no limit; for now treat all as free cap)
  const count = await countNotes(user.id);
  if (count >= FREE_TIER_CAP) {
    throw error(403, `Note limit reached (${FREE_TIER_CAP}). Upgrade to Pro for unlimited notes.`);
  }

  const note = await insertNote(user.id, {
    symbol: normalizeSymbol(symbol),
    timeframe,
    bar_time,
    price_at_write,
    body: noteBody,
    tag,
  });

  return json({ note }, { status: 201 });
};
