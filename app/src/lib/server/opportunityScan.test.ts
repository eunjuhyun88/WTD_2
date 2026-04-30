import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/opportunity/scanner', () => ({
	runOpportunityScan: vi.fn(),
	extractAlerts: vi.fn(),
}));

vi.mock('$lib/server/db', () => ({
	query: vi.fn(async () => ({ rows: [] })),
}));

import { query } from '$lib/server/db';
import { extractAlerts, runOpportunityScan } from '$lib/server/opportunity/scanner';
import { getOrRunOpportunityScan } from './opportunityScan';

describe('opportunityScan helper', () => {
	it('coalesces through the shared cache and persists only on the first miss', async () => {
		vi.mocked(runOpportunityScan).mockResolvedValueOnce({
			scannedAt: 1_712_000_000_000,
			scanDurationMs: 432,
			macroBackdrop: {
				regime: 'risk_on',
				overallMacroScore: 72,
			},
			coins: [
				{
					symbol: 'ETH',
					totalScore: 81,
					direction: 'long',
					confidence: 74,
					reasons: ['momentum'],
				},
			],
		} as any);
		vi.mocked(extractAlerts).mockReturnValueOnce([
			{ level: 'warning', message: 'volatility' } as any,
		]);

		const first = await getOrRunOpportunityScan(17);
		const second = await getOrRunOpportunityScan(17);

		expect(first.cacheStatus).toBe('miss');
		expect(second.cacheStatus).toBe('hit');
		expect(first.payload.result.coins[0].symbol).toBe('ETH');
		expect(second.payload.result.coins[0].symbol).toBe('ETH');
		expect(vi.mocked(runOpportunityScan)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(extractAlerts)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(query)).toHaveBeenCalledTimes(2); // persistToDb + fetchRecentEngineAlerts
	});
});
