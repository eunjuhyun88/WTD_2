import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		COINGLASS_API_KEY: 'cg_live_key_1234567890',
		ROOTDATA_API_KEY: 'rootdata_live_key_123456',
		TOKENOMIST_API_KEY: 'tokenomist_live_key_123456',
	},
}));

vi.mock('$lib/server/defillama', () => ({
	fetchDefiLlamaStableMcap: vi.fn(),
}));

vi.mock('$lib/server/dune', () => ({
	fetchActiveAddresses: vi.fn(),
	fetchDexVolume24hUsd: vi.fn(),
	fetchExchangeBalance: vi.fn(),
	fetchWhaleActivity: vi.fn(),
	hasDuneKey: vi.fn(),
}));

vi.mock('$lib/server/feargreed', () => ({
	fetchFearGreed: vi.fn(),
}));

vi.mock('$lib/server/fred', () => ({
	fetchFredMacroData: vi.fn(),
	hasFredKey: vi.fn(),
}));

vi.mock('$lib/server/yahooFinance', () => ({
	fetchYahooSeries: vi.fn(),
}));

vi.mock('$lib/server/providers/coingecko', () => ({
	fetchCoinGeckoGlobal: vi.fn(),
	fetchStablecoinMcap: vi.fn(),
}));

vi.mock('$lib/server/chainIntel', () => ({
	fetchChainIntel: vi.fn(),
}));

import { env } from '$env/dynamic/private';
import { fetchChainIntel } from '$lib/server/chainIntel';
import { fetchDefiLlamaStableMcap } from '$lib/server/defillama';
import {
	fetchActiveAddresses,
	fetchDexVolume24hUsd,
	fetchExchangeBalance,
	fetchWhaleActivity,
	hasDuneKey,
} from '$lib/server/dune';
import { fetchFearGreed } from '$lib/server/feargreed';
import { fetchFredMacroData, hasFredKey } from '$lib/server/fred';
import { fetchCoinGeckoGlobal, fetchStablecoinMcap } from '$lib/server/providers/coingecko';
import { fetchYahooSeries } from '$lib/server/yahooFinance';
import {
	formatMarketReferenceStackForPrompt,
	loadMarketReferenceStack,
	toMarketReferenceStackAgentContext,
} from './marketReferenceStack';

function buildFetchMock(options: { airdropsAvailable: boolean }) {
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);

		if (url.includes('open-api-v4.coinglass.com')) {
			return new Response(JSON.stringify({ data: { series: [{ value: 1 }] } }), { status: 200 });
		}
		if (url.includes('api.rootdata.com/open/ser_inv')) {
			return new Response(
				JSON.stringify({
					result: 200,
					data: [{ id: 'project-btc', type: 1, name: 'Bitcoin' }],
				}),
				{ status: 200 },
			);
		}
		if (url.includes('api.rootdata.com/open/get_item')) {
			return new Response(
				JSON.stringify({
					result: 200,
					data: {
						name: 'Bitcoin',
						investors: [{ name: 'HashKey' }],
					},
				}),
				{ status: 200 },
			);
		}
		if (url.includes('api.unlocks.app/v1/token/list')) {
			return new Response(
				JSON.stringify({
					data: [{ id: 'token-btc', symbol: 'BTC', slug: 'bitcoin', name: 'Bitcoin' }],
				}),
				{ status: 200 },
			);
		}
		if (url.includes('api.unlocks.app/v1/unlock/events/upcoming')) {
			return new Response(
				JSON.stringify({
					data: [
						{ tokenId: 'token-btc', tokenSymbol: 'BTC', unlockDate: '2026-05-01' },
						{ tokenId: 'token-sol', tokenSymbol: 'SOL', unlockDate: '2026-05-03' },
					],
				}),
				{ status: 200 },
			);
		}
		if (url.includes('api.unlocks.app/v1/fundraising/token/token-btc')) {
			return new Response(JSON.stringify({ data: { totalRaisedUsd: 100_000_000 } }), { status: 200 });
		}
		if (url === 'https://airdrops.io') {
			if (!options.airdropsAvailable) {
				return new Response('unavailable', { status: 503 });
			}
			return new Response(
				'<h2 class="entry-title"><a href="https://airdrops.io/test-drop/">Test Drop</a></h2>',
				{ status: 200 },
			);
		}
		throw new Error(`unexpected fetch url: ${url}`);
	});
}

describe('loadMarketReferenceStack', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(env, {
			COINGLASS_API_KEY: 'cg_live_key_1234567890',
			ROOTDATA_API_KEY: 'rootdata_live_key_123456',
			TOKENOMIST_API_KEY: 'tokenomist_live_key_123456',
		});
		vi.stubGlobal('fetch', buildFetchMock({ airdropsAvailable: true }));

		vi.mocked(hasDuneKey).mockReturnValue(true);
		vi.mocked(hasFredKey).mockReturnValue(true);
		vi.mocked(fetchDefiLlamaStableMcap).mockResolvedValue({
			totalMcapUsd: 200_000_000_000,
			change24hPct: 0.5,
			change7dPct: 2.1,
			updatedAt: 1_710_000_000_000,
		});
		vi.mocked(fetchExchangeBalance).mockResolvedValue(1_234_567);
		vi.mocked(fetchWhaleActivity).mockResolvedValue(42);
		vi.mocked(fetchActiveAddresses).mockResolvedValue(543_210);
		vi.mocked(fetchDexVolume24hUsd).mockResolvedValue(8_100_000_000);
		vi.mocked(fetchFearGreed).mockResolvedValue({
			current: {
				value: 61,
				classification: 'Greed',
				timestampMs: 1_710_000_000_000,
			},
			points: [{ value: 61, classification: 'Greed', timestampMs: 1_710_000_000_000 }],
		});
		vi.mocked(fetchFredMacroData).mockResolvedValue({
			fedFundsRate: null,
			treasury10y: null,
			treasury2y: null,
			yieldCurve: null,
			cpi: null,
			m2: null,
			updatedAt: 1_710_000_000_000,
		});
		vi.mocked(fetchYahooSeries).mockResolvedValue({
			symbol: '^GSPC',
			points: [{ timestampMs: 1_710_000_000_000, close: 5000, high: null, low: null, volume: null }],
			previousClose: 4950,
			regularMarketPrice: 5000,
			regularMarketChangePercent: 1,
			updatedAt: 1_710_000_000_000,
		});
		vi.mocked(fetchCoinGeckoGlobal).mockResolvedValue({
			totalMarketCapUsd: 2_500_000_000_000,
			totalVolumeUsd: 90_000_000_000,
			btcDominance: 54,
			ethDominance: 17,
			marketCapChange24hPct: 1.2,
			activeCryptocurrencies: 14_000,
			updatedAt: 1_710_000_000_000,
		});
		vi.mocked(fetchStablecoinMcap).mockResolvedValue({
			totalMcapUsd: 180_000_000_000,
			change24hPct: 0.4,
			top: [{ id: 'tether', symbol: 'USDT', marketCapUsd: 110_000_000_000 }],
			updatedAt: 1_710_000_000_000,
		});
		vi.mocked(fetchChainIntel).mockResolvedValue({
			at: 1_710_000_000_000,
			providers: {
				account: {
					provider: 'etherscan',
					status: 'live',
					detail: 'live',
					updatedAt: 1_710_000_000_000,
				},
			},
			family: 'evm',
			chain: 'ethereum',
			chainId: '1',
			chainLabel: 'Ethereum',
			entity: 'account',
			address: '0xabc',
			addressSource: 'default',
			summary: {
				title: 'Ethereum account intel',
				subtitle: 'default',
				keySignals: [],
				nextChecks: [],
			},
		} as any);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns a fully live stack when gated provider keys are configured', async () => {
		const payload = await loadMarketReferenceStack({ symbol: 'BTC' });

		expect(payload.query.symbol).toBe('BTCUSDT');
		expect(payload.coverage).toEqual({
			total: 10,
			live: 10,
			blocked: 0,
			referenceOnly: 0,
		});

		const tokenomist = payload.entries.find((entry) => entry.id === 'tokenomist');
		const arkham = payload.entries.find((entry) => entry.id === 'arkham-intel');
		const airdrops = payload.entries.find((entry) => entry.id === 'airdrops-io');

		expect(tokenomist?.status).toBe('live');
		expect((tokenomist?.payload as any)?.matchingAssetUnlocks).toHaveLength(1);
		expect(arkham?.collector.usingFallback).toBe(true);
		expect(airdrops?.status).toBe('live');
	});

	it('degrades gated sources to blocked or reference-only when credentials or scrape access are absent', async () => {
		Object.assign(env, {
			COINGLASS_API_KEY: '',
			ROOTDATA_API_KEY: '',
			TOKENOMIST_API_KEY: '',
		});
		vi.mocked(hasDuneKey).mockReturnValue(false);
		vi.mocked(hasFredKey).mockReturnValue(false);
		vi.stubGlobal('fetch', buildFetchMock({ airdropsAvailable: false }));

		const payload = await loadMarketReferenceStack({ symbol: 'ETH' });
		const coinglass = payload.entries.find((entry) => entry.id === 'coinglass');
		const rootdata = payload.entries.find((entry) => entry.id === 'rootdata');
		const tokenomist = payload.entries.find((entry) => entry.id === 'tokenomist');
		const dune = payload.entries.find((entry) => entry.id === 'dune');
		const airdrops = payload.entries.find((entry) => entry.id === 'airdrops-io');

		expect(coinglass?.status).toBe('blocked');
		expect(rootdata?.status).toBe('blocked');
		expect(tokenomist?.status).toBe('blocked');
		expect(dune?.status).toBe('blocked');
		expect(airdrops?.status).toBe('reference_only');
		expect(payload.coverage.referenceOnly).toBe(1);
	});

	it('builds compact agent context and prompt text from the reference stack', async () => {
		const payload = await loadMarketReferenceStack({ symbol: 'BTC' });
		const compact = toMarketReferenceStackAgentContext(payload, 2);
		const prompt = formatMarketReferenceStackForPrompt(payload, 2);

		expect(compact.live.length).toBe(2);
		expect(compact.coverage.live).toBe(10);
		expect(prompt).toContain('coverage: live 10/10');
		expect(prompt).toContain('Use live sources as evidence.');
	});
});
