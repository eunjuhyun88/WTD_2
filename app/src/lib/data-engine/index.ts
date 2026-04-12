// ═══════════════════════════════════════════════════════════════
// Data Engine — Barrel Export
// ═══════════════════════════════════════════════════════════════
//
// Sprint 1: types + normalization functions.
// Alignment, cache, scheduler, and provider adapters are added in Sprints 2-5.

// ─── Types ───────────────────────────────────────────────────

export type {
	DataCadence,
	NormalizedPoint,
	NormalizedOHLCV,
	NormalizedSeries,
	NormalizedSnapshot,
	ResampleMode,
	FillMode,
} from './types';

// ─── Symbol ──────────────────────────────────────────────────

export { normalizeSymbol } from './normalization/normalizeSymbol';

// ─── Timeframe ───────────────────────────────────────────────

export {
	normalizeTimeframe,
	timeframeDurationSeconds,
	VALID_TIMEFRAMES,
} from './normalization/normalizeTimeframe';
export type { ValidTimeframe } from './normalization/normalizeTimeframe';

// ─── Timestamp ───────────────────────────────────────────────

export {
	normalizeTimestamp,
	normalizeTimestamps,
	floorToTimeframe,
} from './normalization/normalizeTimestamp';

// ─── Units ───────────────────────────────────────────────────

export {
	fundingRateToBps,
	bpsToFundingRate,
	oiContractsToUsd,
	percentToRatio,
	ratioToPercent,
	annualToEightHour,
	eightHourToAnnual,
} from './normalization/normalizeUnit';

// ─── Alignment (Sprint 2) ─────────────────────────────────────

export { alignSeries } from './alignment/alignSeries';
export { resampleSeries } from './alignment/resampleSeries';
export { fillGaps } from './alignment/fillGaps';

// ─── Cache (Sprint 3) ─────────────────────────────────────────

export { SeriesCache } from './cache/seriesCache';
export { SnapshotCache } from './cache/snapshotCache';

// ─── Scheduler (Sprint 4) ─────────────────────────────────────

export { CADENCE_MS, CADENCE_SECONDS, DATA_CADENCE } from './scheduler/cadenceRegistry'
export { PollingScheduler } from './scheduler/pollingScheduler'
export type { PollTask } from './scheduler/pollingScheduler'
export { SubscriptionManager } from './scheduler/subscriptionManager'

// ─── Providers (Sprint 5) ────────────────────────────────────

export { ProviderRegistry } from './providers/providerAdapter'
export type { DataEngineProvider } from './providers/providerAdapter'
export { createBinanceAdapter } from './providers/binanceAdapter'
export { createCoinalyzeAdapter } from './providers/coinalyzeAdapter'

// ─── Context (Sprint 5) ──────────────────────────────────────

export { buildContextFromCache } from './context/contextBuilder'
