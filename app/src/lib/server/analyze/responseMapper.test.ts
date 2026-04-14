import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/engine/cogochi/layerEngine', () => ({
	computeIndicatorSeries: () => ({
		bbUpper: [110, 111],
		bbMiddle: [100, 101],
		bbLower: [90, 91],
		ema20: [99, 100],
	}),
}));

vi.mock('$lib/engine/cogochi/supportResistance', () => ({
	detectSupportResistance: () => [],
}));

import { mapAnalyzeResponse } from './responseMapper';
import type { AnalyzeDerived, AnalyzeRawBundle, EngineSettled } from './types';

function createRawBundle(): AnalyzeRawBundle {
	return {
		klines: [
			{ time: 1, open: 100, high: 110, low: 95, close: 105, volume: 10, takerBuyBaseAssetVolume: 5 },
			{ time: 2, open: 105, high: 112, low: 101, close: 108, volume: 12, takerBuyBaseAssetVolume: 6 },
		],
		klines1h: [],
		ticker: { priceChangePercent: '2.5' },
		markPrice: 108,
		indexPrice: 107,
		oiPoint: 1_500,
		oiHistory1h: null,
		lsTop: 1.2,
		depth: null,
		takerPoints: [],
		forceOrders: [],
		fundingRate: 0.01,
	};
}

function createDerived(): AnalyzeDerived {
	return {
		currentPrice: 108,
		oi_notional: 162_000,
		short_liq_usd: 1200,
		long_liq_usd: 900,
		oi_pct: 4.5,
		taker_ratio: 1.1,
		vol_24h: 2_500_000,
		spreadBps: 3.2,
		imbalancePct: 12,
		depthView: null,
		liqClusters: [],
	};
}

describe('mapAnalyzeResponse', () => {
	it('marks full engine responses as non-degraded', () => {
		const payload = mapAnalyzeResponse(createRawBundle(), createDerived(), {
			deepResult: { verdict: 'BULLISH', total_score: 28, layers: {} },
			scoreResult: { snapshot: { regime: 'risk_on' }, p_win: 0.61, blocks_triggered: ['trend'], ensemble: null, ensemble_triggered: false },
			deepError: null,
			scoreError: null,
		} satisfies EngineSettled);

		expect(payload._fallback).toBe(false);
		expect(payload._degraded).toBe(false);
		expect(payload.meta).toMatchObject({
			ok: true,
			degraded: false,
			engine_mode: 'full',
		});
	});

	it('marks deep-only responses as degraded with missing score metadata', () => {
		const payload = mapAnalyzeResponse(createRawBundle(), createDerived(), {
			deepResult: { verdict: 'BULLISH', total_score: 28, layers: {} },
			scoreResult: null,
			deepError: null,
			scoreError: new Error('score unavailable'),
		} satisfies EngineSettled);

		expect(payload._fallback).toBe(false);
		expect(payload._degraded).toBe(true);
		expect(payload._degraded_reason).toBe('score_unavailable');
		expect(payload.meta).toMatchObject({
			ok: true,
			degraded: true,
			engine_mode: 'deep_only',
			degraded_reason: 'score_unavailable',
			upstream_missing: ['score'],
		});
	});

	it('marks score-only responses as degraded with missing deep metadata', () => {
		const payload = mapAnalyzeResponse(createRawBundle(), createDerived(), {
			deepResult: null,
			scoreResult: { snapshot: { regime: 'risk_off' }, p_win: 0.43, blocks_triggered: [], ensemble: null, ensemble_triggered: false },
			deepError: new Error('deep unavailable'),
			scoreError: null,
		} satisfies EngineSettled);

		expect(payload._fallback).toBe(false);
		expect(payload._degraded).toBe(true);
		expect(payload._degraded_reason).toBe('deep_unavailable');
		expect(payload.meta).toMatchObject({
			ok: true,
			degraded: true,
			engine_mode: 'score_only',
			degraded_reason: 'deep_unavailable',
			upstream_missing: ['deep'],
		});
	});
});
