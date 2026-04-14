// ═══════════════════════════════════════════════════════════════
// Comparison Mode API
// ═══════════════════════════════════════════════════════════════
// User selects 2-5 pairs → runs full scan on each → side-by-side

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runServerScan } from '$lib/server/scanEngine';
import { compareLimiter } from '$lib/server/rateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: compareLimiter,
    scope: 'terminal:compare',
    max: 3,
    tooManyMessage: 'Too many comparison requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 8 * 1024);
    const pairs = Array.isArray(body?.pairs) ? body.pairs : [];
    const timeframe = typeof body?.timeframe === 'string' ? body.timeframe : '4h';

    if (!Array.isArray(pairs) || pairs.length < 2 || pairs.length > 5) {
      return json({ error: 'Provide 2-5 pairs to compare' }, { status: 400 });
    }

    // Validate pairs
    const validPairs = pairs
      .map(p => String(p).trim().toUpperCase())
      .filter(p => /^[A-Z]{2,10}\/USDT$/.test(p));

    if (validPairs.length < 2) {
      return json({ error: 'Need at least 2 valid pairs (e.g., BTC/USDT)' }, { status: 400 });
    }

    // Run scans in parallel
    const scanPromises = validPairs.map(pair =>
      runServerScan(pair, timeframe).catch(err => ({
        pair,
        error: (err as Error).message,
      }))
    );

    const results = await Promise.allSettled(scanPromises);

    const scans = results.map((r, i) => {
      if (r.status === 'fulfilled') {
        const val = r.value;
        if ('error' in val) {
          return { pair: validPairs[i], error: val.error, scan: null };
        }
        return { pair: validPairs[i], error: null, scan: val };
      }
      return { pair: validPairs[i], error: 'Scan failed', scan: null };
    });

    // Build comparison summary
    const successfulScans = scans.filter(s => s.scan != null);
    const comparison = successfulScans.map(s => ({
      pair: s.pair,
      consensus: s.scan!.consensus,
      avgConfidence: s.scan!.avgConfidence,
      summary: s.scan!.summary,
      agentVotes: s.scan!.signals.map(sig => ({
        agent: sig.name,
        vote: sig.vote,
        conf: sig.conf,
      })),
    }));

    // Rank by confidence * directional alignment
    const ranked = comparison
      .map(c => ({
        ...c,
        rankScore: c.avgConfidence * (c.consensus === 'neutral' ? 0.7 : 1.0),
      }))
      .sort((a, b) => b.rankScore - a.rankScore);

    return json(
      {
        ok: true,
        data: {
          scans,
          comparison: ranked,
          bestPick: ranked[0] ?? null,
          scannedAt: Date.now(),
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error: unknown) {
    if (isRequestBodyTooLargeError(error)) {
      return json({ error: 'Request body too large' }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }
    console.error('[compare] error:', error);
    return json({ error: 'Comparison failed' }, { status: 500 });
  }
};
