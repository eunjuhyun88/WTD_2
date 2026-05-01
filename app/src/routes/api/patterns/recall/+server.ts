/**
 * POST /api/patterns/recall
 *
 * D-6 mock pattern-recall endpoint. Accepts a symbol/timeframe + time range
 * and returns deterministic mock similar patterns. Real implementation will
 * eventually call the engine pattern recall service.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface RecallRequest {
  symbol: string;
  timeframe: string;
  fromTime: number;   // Unix seconds
  toTime: number;     // Unix seconds
}

interface PatternRecallDTO {
  id: string;
  slug: string;
  label: string;
  similarity: number;       // 0..1
  capturedAt: number;       // Unix seconds
  outcome: 'win' | 'loss' | 'neutral' | 'unknown';
  symbol: string;
  timeframe: string;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const SLUGS = [
  'liquidation-grab',
  'compressed-range-break',
  'fvg-fill-rejection',
  'session-high-sweep',
  'session-low-reclaim',
  'regime-flip',
  'trend-continuation',
  'failure-swing',
];

export const POST: RequestHandler = async ({ request }) => {
  let body: RecallRequest;
  try {
    body = (await request.json()) as RecallRequest;
  } catch {
    return json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.symbol || !body.timeframe || !Number.isFinite(body.fromTime) || !Number.isFinite(body.toTime)) {
    return json({ error: 'missing_required_fields' }, { status: 400 });
  }

  const seed = hash(`${body.symbol}|${body.timeframe}|${Math.floor(body.fromTime / 60)}`);
  const count = 3 + (seed % 3);              // 3..5 results
  const patterns: PatternRecallDTO[] = [];

  for (let i = 0; i < count; i++) {
    const slug = SLUGS[(seed + i) % SLUGS.length];
    const similarity = +(0.55 + ((seed + i * 13) % 42) / 100).toFixed(2);
    const ageDays = 1 + ((seed + i * 7) % 60);
    const outcomes: PatternRecallDTO['outcome'][] = ['win', 'loss', 'neutral', 'win'];
    patterns.push({
      id: `mock-${seed}-${i}`,
      slug,
      label: slug.replace(/-/g, ' '),
      similarity,
      capturedAt: Math.floor(Date.now() / 1000) - ageDays * 86400,
      outcome: outcomes[i % outcomes.length],
      symbol: body.symbol,
      timeframe: body.timeframe,
    });
  }

  patterns.sort((a, b) => b.similarity - a.similarity);

  return json({ patterns });
};
