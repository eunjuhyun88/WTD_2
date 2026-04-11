// ═══════════════════════════════════════════════════════════════
// Stockclaw — Coinalyze loader (legacy path, re-export shim)
// ═══════════════════════════════════════════════════════════════
//
// The canonical location of every Coinalyze fetcher is now
// `src/lib/server/providers/coinalyze.ts`. This file remains for
// backward compatibility: two existing callers (scanEngine.ts,
// alertRules.ts) still import from `$lib/server/coinalyze`, and we
// do not want to touch both in the same slice that moves the code.
//
// Future slices will migrate each caller to import directly from
// `$lib/server/providers/coinalyze`, then this shim will be deleted.
// See `docs/exec-plans/active/trunk-plan.dag.json` P1.A0-coinalyze.

export {
	fetchCurrentOIServer,
	fetchCurrentFundingServer,
	fetchPredictedFundingServer,
	fetchOIHistoryServer,
	fetchFundingHistoryServer,
	fetchLiquidationHistoryServer,
	fetchLSRatioHistoryServer
} from './providers/coinalyze';
export type {
	OIDataPoint,
	FundingDataPoint,
	LiquidationDataPoint,
	LSRatioDataPoint
} from './providers/coinalyze';
