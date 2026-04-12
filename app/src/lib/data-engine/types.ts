// ═══════════════════════════════════════════════════════════════
// Data Engine — Normalized Data Types
// ═══════════════════════════════════════════════════════════════
//
// All data flowing through the data-engine uses these canonical types.
// Providers output raw formats; adapters convert to NormalizedSeries/Snapshot.

// ─── Cadence ─────────────────────────────────────────────────

export type DataCadence = 'tick' | '1s' | '5s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

// ─── Normalized Point ─────────────────────────────────────────

export interface NormalizedPoint {
	ts: number;          // Unix seconds (NOT milliseconds)
	value: number | null;
}

// ─── Normalized OHLCV ────────────────────────────────────────

export interface NormalizedOHLCV {
	ts: number;          // Unix seconds
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	takerBuyVol?: number;
}

// ─── Normalized Series ───────────────────────────────────────

export interface NormalizedSeries {
	id: string;          // e.g., 'binance:klines:BTCUSDT:4h'
	symbol: string;      // Normalized symbol (BTCUSDT)
	timeframe: string;   // Normalized TF (4h)
	provider: string;    // Source provider name
	unit: string;        // usd, btc, ratio, bps, percent, count, score
	points: NormalizedPoint[];
	meta?: {
		fetchedAt: number;   // Unix seconds
		ttlMs: number;       // Cache validity in ms
		cadence: DataCadence;
	};
}

// ─── Normalized Snapshot ─────────────────────────────────────

export interface NormalizedSnapshot {
	id: string;
	symbol: string;
	provider: string;
	ts: number;          // Unix seconds
	values: Record<string, number | null>;
}

// ─── Resample / Fill Modes ───────────────────────────────────

export type ResampleMode = 'last' | 'mean' | 'sum' | 'max' | 'min';
export type FillMode = 'forward' | 'zero' | 'interpolate' | 'none';
