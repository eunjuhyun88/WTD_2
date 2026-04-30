import {
	runOpportunityScan,
	extractAlerts,
	type OpportunityScanResult,
	type OpportunityScore,
	type OpportunityAlert,
} from '$lib/server/opportunity/scanner';
import { createSharedPublicRouteCache, type PublicRouteCacheStatus } from '$lib/server/publicRouteCache';
import { query } from '$lib/server/db';

const CACHE_TTL_MS = 60_000;

// ── Engine alert integration (W-0341) ────────────────────────

interface EngineAlertRow {
	symbol: string;
	blocks_triggered: string[];
	p_win: number | null;
	snapshot: Record<string, unknown> | null;
}

async function fetchRecentEngineAlerts(): Promise<EngineAlertRow[]> {
	try {
		const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
		const result = await query<EngineAlertRow>(
			`SELECT symbol, blocks_triggered, p_win, snapshot
       FROM engine_alerts
       WHERE scanned_at >= $1
       ORDER BY p_win DESC NULLS LAST`,
			[since],
		);
		return result.rows;
	} catch {
		return [];
	}
}

function mergeEngineAlerts(
	scanResult: OpportunityScanResult,
	engineAlerts: EngineAlertRow[],
): OpportunityScanResult {
	if (engineAlerts.length === 0) return scanResult;

	// Best engine alert per symbol (highest p_win)
	const bestBySymbol = new Map<string, EngineAlertRow>();
	for (const ea of engineAlerts) {
		const existing = bestBySymbol.get(ea.symbol);
		if (!existing || (ea.p_win ?? 0) > (existing.p_win ?? 0)) {
			bestBySymbol.set(ea.symbol, ea);
		}
	}

	const existingSymbols = new Set(scanResult.coins.map((c) => c.symbol));

	// Annotate existing TS coins with engine confirmation
	const annotatedCoins: OpportunityScore[] = scanResult.coins.map((coin) => {
		const ea = bestBySymbol.get(coin.symbol);
		if (!ea) return coin;

		const boost = Math.min(10, Math.round((ea.p_win ?? 0.5) * 8 + ea.blocks_triggered.length));
		const blockAlerts = ea.blocks_triggered.slice(0, 3).map((b) => `🔬 ${b}`);

		return {
			...coin,
			totalScore: Math.min(100, coin.totalScore + boost),
			alerts: [...coin.alerts, ...blockAlerts],
			engineSignal: true,
			engineBlocks: ea.blocks_triggered,
			enginePWin: ea.p_win,
		};
	});

	// Add engine-only symbols as stub coins
	const stubCoins: OpportunityScore[] = [];
	for (const [symbol, ea] of bestBySymbol) {
		if (existingSymbols.has(symbol)) continue;
		const snap = ea.snapshot ?? {};
		const price = (snap['price'] as number | undefined) ?? 0;
		const pWin = ea.p_win ?? 0.55;
		const totalScore = Math.round(Math.min(80, 40 + pWin * 40 + ea.blocks_triggered.length * 2));
		const reasons = ea.blocks_triggered.slice(0, 3).map((b) => b.replace(/_/g, ' '));
		if (reasons.length === 0) reasons.push('엔진 시그널');

		stubCoins.push({
			symbol,
			name: symbol,
			slug: symbol.toLowerCase(),
			price,
			change1h: 0,
			change24h: 0,
			change7d: 0,
			volume24h: 0,
			marketCap: 0,
			momentumScore: 0,
			volumeScore: 0,
			socialScore: 0,
			macroScore: 7,
			onchainScore: Math.round(pWin * 10),
			totalScore,
			direction: 'long',
			confidence: Math.round(45 + pWin * 40),
			reasons,
			alerts: ea.blocks_triggered.slice(0, 3).map((b) => `🔬 ${b}`),
			engineSignal: true,
			engineBlocks: ea.blocks_triggered,
			enginePWin: ea.p_win,
		});
	}

	const allCoins = [...annotatedCoins, ...stubCoins];
	allCoins.sort((a, b) => b.totalScore - a.totalScore);

	return { ...scanResult, coins: allCoins };
}

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
		const [tsScanResult, engineAlerts] = await Promise.all([
			runOpportunityScan(limit),
			fetchRecentEngineAlerts(),
		]);
		const result = mergeEngineAlerts(tsScanResult, engineAlerts);
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
