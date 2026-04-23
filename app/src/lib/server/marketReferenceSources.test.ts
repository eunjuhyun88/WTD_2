import { describe, expect, it } from 'vitest';

import { getMarketReferenceSources } from './marketReferenceSources';

describe('getMarketReferenceSources', () => {
	it('returns the curated 10-site crypto reference catalog in stable order', () => {
		const sources = getMarketReferenceSources();

		expect(sources).toHaveLength(10);
		expect(sources.map((source) => source.name)).toEqual([
			'MacroMicro',
			'fuckbtc.com',
			'RootData',
			'CoinGlass',
			'DeFiLlama',
			'Dune Analytics',
			'Tokenomist',
			'Arkham Intel',
			'Airdrops.io',
			'CoinGecko',
		]);
		expect(sources.every((source) => source.ingestion === 'reference_only')).toBe(true);
		expect(new Set(sources.map((source) => source.url)).size).toBe(sources.length);
	});
});
