import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

const MOCK_QUESTIONS = Array.from({ length: 10 }, (_, i) => ({
  id: `mock-${i + 1}`,
  symbol: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'AVAXUSDT'][i % 5],
  timeframe: ['4h', '1h', '1d', '4h', '1h'][i % 5],
  note: 'Pattern quiz — predict direction',
}));

export const GET: RequestHandler = async () => {
  try {
    const result = await query<{ id: string; symbol: string; timeframe: string }>(
      `SELECT id, symbol, timeframe
       FROM pattern_captures
       ORDER BY created_at DESC
       LIMIT 10`,
    );

    if (result.rows.length >= 5) {
      const questions = result.rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        timeframe: r.timeframe,
        // correct direction intentionally omitted from response
      }));
      return json({ questions });
    }
  } catch {
    // fall through to mock
  }
  return json({ questions: MOCK_QUESTIONS });
};
