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
import { runOpportunityScan, extractAlerts, type OpportunityScanResult, type OpportunityAlert } from '$lib/engine/opportunityScanner';
import { query } from '$lib/server/db';
import { opportunityScanLimiter } from '$lib/server/rateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { getSharedCache, setSharedCache } from '$lib/server/sharedCache';

// ── Server-side result cache + coalescing ────────────────────

const CACHE_TTL_MS = 60_000; // 60s — scan results are the same for everyone

interface CachedScan {
  result: OpportunityScanResult;
  alerts: OpportunityAlert[];
  cachedAt: number;
}

let _cachedScan: CachedScan | null = null;
let _inflightPromise: Promise<CachedScan> | null = null;

/**
 * Returns a cached or fresh scan result.
 * If a scan is already in progress, callers piggyback on the same promise
 * (request coalescing). This prevents 1000 simultaneous API storms.
 */
async function getOrRunScan(limit: number): Promise<CachedScan> {
  const sharedKey = `limit:${limit}`;

  // Serve from cache if fresh
  if (_cachedScan && Date.now() - _cachedScan.cachedAt < CACHE_TTL_MS) {
    return _cachedScan;
  }

  const shared = await getSharedCache<CachedScan>('terminal:opportunity-scan', sharedKey);
  if (shared && Date.now() - shared.cachedAt < CACHE_TTL_MS) {
    _cachedScan = shared;
    return shared;
  }

  // Coalesce: if a scan is already running, wait for it
  if (_inflightPromise) {
    return _inflightPromise;
  }

  // Run a new scan
  _inflightPromise = (async (): Promise<CachedScan> => {
    try {
      const result = await runOpportunityScan(limit);
      const alerts = extractAlerts(result);

      const cached: CachedScan = { result, alerts, cachedAt: Date.now() };
      _cachedScan = cached;
      await setSharedCache('terminal:opportunity-scan', sharedKey, cached, CACHE_TTL_MS);

      // Best-effort DB persist (don't block response)
      persistToDb(result, alerts).catch(() => {});

      return cached;
    } finally {
      _inflightPromise = null;
    }
  })();

  return _inflightPromise;
}

async function persistToDb(result: OpportunityScanResult, alerts: OpportunityAlert[]): Promise<void> {
  try {
    const top5 = result.coins.slice(0, 5);
    await query(
      `INSERT INTO opportunity_scans (
        scanned_at, coin_count, macro_regime, macro_score,
        top_picks, alerts, scan_duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        new Date(result.scannedAt),
        result.coins.length,
        result.macroBackdrop.regime,
        result.macroBackdrop.overallMacroScore,
        JSON.stringify(top5.map(c => ({
          symbol: c.symbol, score: c.totalScore, direction: c.direction,
          confidence: c.confidence, reasons: c.reasons,
        }))),
        JSON.stringify(alerts.slice(0, 10)),
        result.scanDurationMs,
      ],
    );
  } catch (dbErr) {
    // DB not available or table doesn't exist — scan still works
    console.warn('[opportunity-scan] DB persist failed:', (dbErr as Error).message);
  }
}

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
    const { result, alerts } = await getOrRunScan(limit);

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
        headers: {
          'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=60',
        },
      }
    );
  } catch (error: unknown) {
    console.error('[opportunity-scan] error:', error);
    return json({ error: 'Opportunity scan failed' }, { status: 500 });
  }
};
