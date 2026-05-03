/**
 * POST /api/patterns/recall
 *
 * Returns the user's real captured patterns for the same symbol + timeframe,
 * sorted by proximity to the selected time range.
 * Proxies to engine GET /captures?symbol&limit=20, filters by timeframe client-side.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

interface RecallRequest {
  symbol: string;
  timeframe: string;
  fromTime: number;
  toTime: number;
}

interface PatternRecallDTO {
  id: string;
  slug: string;
  label: string;
  similarity: number;
  capturedAt: number;
  outcome: 'win' | 'loss' | 'neutral' | 'unknown';
  symbol: string;
  timeframe: string;
}

function proximityScore(capturedAt: number, fromTime: number, toTime: number): number {
  const mid = (fromTime + toTime) / 2;
  const span = Math.max(toTime - fromTime, 3600);
  return Math.max(0, 1 - Math.abs(capturedAt - mid) / (span * 30));
}

function mapOutcome(status: string | undefined): PatternRecallDTO['outcome'] {
  if (status === 'win' || status === 'bullish_confirmed') return 'win';
  if (status === 'loss' || status === 'bearish_confirmed') return 'loss';
  if (status === 'neutral' || status === 'expired') return 'neutral';
  return 'unknown';
}

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

  try {
    const params = new URLSearchParams({ symbol: body.symbol, limit: '20' });
    const res = await engineFetch(`/captures?${params}`);
    if (!res.ok) throw new Error(`engine ${res.status}`);

    const data = (await res.json()) as { captures: Record<string, unknown>[] };
    const captures = (data.captures ?? []).filter(
      (c) => (c.timeframe as string | undefined) === body.timeframe
    );

    const patterns: PatternRecallDTO[] = captures.map((c) => {
      const capturedAt = typeof c.captured_at === 'number'
        ? c.captured_at
        : Math.floor(new Date(c.captured_at as string).getTime() / 1000);
      const slug = (c.pattern_slug as string | undefined) ?? 'unknown';
      return {
        id: c.id as string,
        slug,
        label: slug.replace(/-/g, ' '),
        similarity: proximityScore(capturedAt, body.fromTime, body.toTime),
        capturedAt,
        outcome: mapOutcome(c.status as string | undefined),
        symbol: body.symbol,
        timeframe: body.timeframe,
      };
    });

    patterns.sort((a, b) => b.similarity - a.similarity);
    return json({ patterns: patterns.slice(0, 5) });
  } catch (e) {
    console.error('[recall] engine fetch failed', e);
    return json({ patterns: [] });
  }
};
