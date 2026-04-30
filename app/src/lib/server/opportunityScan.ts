import {
	runOpportunityScan,
	extractAlerts,
	type OpportunityScanResult,
	type OpportunityAlert,
} from '$lib/server/opportunity/scanner';
import { createSharedPublicRouteCache, type PublicRouteCacheStatus } from '$lib/server/publicRouteCache';
import { query } from '$lib/server/db';

const CACHE_TTL_MS = 60_000;

export interface CachedOpportunityScan {
	result: OpportunityScanResult;
	alerts: OpportunityAlert[];
	cachedAt: number;
}

const opportunityScanCache = createSharedPublicRouteCache<CachedOpportunityScan>({
	scope: 'terminal:opportunity-scan',
	ttlMs: CACHE_TTL_MS,
});

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
				JSON.stringify(
					top5.map((c) => ({
						symbol: c.symbol,
						score: c.totalScore,
						direction: c.direction,
						confidence: c.confidence,
						reasons: c.reasons,
					})),
				),
				JSON.stringify(alerts.slice(0, 10)),
				result.scanDurationMs,
			],
		);
	} catch (dbErr) {
		console.warn('[opportunity-scan] DB persist failed:', (dbErr as Error).message);
	}
}

export async function getOrRunOpportunityScan(
	limit: number,
): Promise<{ payload: CachedOpportunityScan; cacheStatus: PublicRouteCacheStatus }> {
	const sharedKey = `limit:${limit}`;
	return opportunityScanCache.run(sharedKey, async () => {
		const result = await runOpportunityScan(limit);
		const alerts = extractAlerts(result);
		const cached: CachedOpportunityScan = {
			result,
			alerts,
			cachedAt: Date.now(),
		};
		persistToDb(result, alerts).catch(() => {});
		return cached;
	});
}
