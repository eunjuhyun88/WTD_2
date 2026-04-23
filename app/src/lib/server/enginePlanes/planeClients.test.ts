import { describe, expect, it, vi } from 'vitest';
import {
	fetchFactConfluenceProxy,
	fetchFactContextProxy,
	fetchIndicatorCatalogProxy,
	fetchFactMarketCapProxy,
	fetchPerpContextProxy,
	fetchFactReferenceStackProxy,
} from './facts';
import { postSearchScanProxy } from './search';
import { fetchRuntimeCaptureProxy } from './runtime';

describe('engine plane clients', () => {
	it('routes fact context through the canonical facts proxy', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				ok: true,
				owner: 'engine',
				plane: 'fact',
				status: 'transitional',
				generated_at: '2026-04-23T00:00:00Z',
				symbol: 'BTCUSDT',
				timeframe: '1h',
			}),
		);

		const payload = await fetchFactContextProxy(fetchMock as typeof fetch, {
			symbol: 'BTCUSDT',
			timeframe: '1h',
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/facts/ctx/fact?symbol=BTCUSDT&timeframe=1h&offline=true',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(payload?.symbol).toBe('BTCUSDT');
	});

	it('routes fact confluence, perp context, reference-stack, market-cap, and indicator catalog through plane-owned URLs', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/facts/confluence')) {
				return Response.json({
					ok: true,
					symbol: 'ETHUSDT',
					timeframe: '4h',
				});
			}
			if (url.startsWith('/api/facts/perp-context')) {
				return Response.json({
					ok: true,
					owner: 'engine',
					plane: 'fact',
					kind: 'perp_context',
					status: 'transitional',
					generated_at: '2026-04-23T00:00:00Z',
					symbol: 'ETHUSDT',
					timeframe: '4h',
					source: { id: 'perp', state: 'live', rows: 600, summary: '600 rows' },
					metrics: {
						funding_rate: -0.0012,
						oi_change_1h: 0.02,
						oi_change_24h: 0.05,
						long_short_ratio: 0.88,
						taker_buy_ratio_1h: 0.61,
					},
					regime: { crowding: 'crowded_shorts', cvd_state: 'buying' },
					notes: [],
				});
			}
			if (url.startsWith('/api/facts/reference-stack')) {
				return Response.json({
					ok: true,
					owner: 'engine',
					plane: 'fact',
					kind: 'reference_stack',
					status: 'transitional',
					generated_at: '2026-04-23T00:00:00Z',
					symbol: 'ETHUSDT',
					timeframe: '1h',
					sources: [{ id: 'klines', state: 'live', rows: 720, summary: '720 rows' }],
					coverage: {
						live: 41,
						partial: 27,
						blocked: 11,
						missing: 21,
						usable_now: 68,
						coverage_pct: 68,
					},
					catalogCounts: { promoted: 12 },
					notes: [],
				});
			}
			if (url.startsWith('/api/facts/market-cap')) {
				return Response.json({
					ok: true,
					owner: 'engine',
					plane: 'fact',
					kind: 'market_cap',
					status: 'transitional',
					generated_at: '2026-04-23T00:00:00Z',
					btc_dominance: 61.2,
				});
			}
			return Response.json({
				ok: true,
				owner: 'engine',
				plane: 'fact',
				kind: 'indicator_catalog',
				status: 'transitional',
				generated_at: '2026-04-23T00:00:00Z',
				total: 100,
				matched: 1,
				filters: { stage: 'promoted' },
				coverage: { live: 41, partial: 27, usable_now: 68, coverage_pct: 68 },
				counts: {},
				metrics: [],
				notes: [],
			});
		});

		const confluence = await fetchFactConfluenceProxy(fetchMock as typeof fetch, {
			symbol: 'ETHUSDT',
			timeframe: '4h',
		});
		const perp = await fetchPerpContextProxy(fetchMock as typeof fetch, {
			symbol: 'ETHUSDT',
			timeframe: '4h',
		});
		const referenceStack = await fetchFactReferenceStackProxy(fetchMock as typeof fetch, {
			symbol: 'ETHUSDT',
		});
		const marketCap = await fetchFactMarketCapProxy(fetchMock as typeof fetch);
		const catalog = await fetchIndicatorCatalogProxy(fetchMock as typeof fetch, {
			stage: 'promoted',
			family: 'technical',
		});

		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			'/api/facts/confluence?symbol=ETHUSDT&timeframe=4h&offline=true',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		const secondUrl = String(fetchMock.mock.calls[1]?.[0]);
		const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
		const thirdUrl = String(fetchMock.mock.calls[2]?.[0]);
		const thirdInit = fetchMock.mock.calls[2]?.[1] as RequestInit | undefined;
		const fourthUrl = String(fetchMock.mock.calls[3]?.[0]);
		const fourthInit = fetchMock.mock.calls[3]?.[1] as RequestInit | undefined;
		const fifthUrl = String(fetchMock.mock.calls[4]?.[0]);
		const fifthInit = fetchMock.mock.calls[4]?.[1] as RequestInit | undefined;
		expect(secondUrl).toBe('/api/facts/perp-context?symbol=ETHUSDT&timeframe=4h&offline=true');
		expect(thirdUrl).toBe('/api/facts/reference-stack?symbol=ETHUSDT&timeframe=1h&offline=true');
		expect(fourthUrl).toBe('/api/facts/market-cap?offline=true');
		expect(fifthUrl.startsWith('/api/facts/indicator-catalog?')).toBe(true);
		expect(fifthUrl).toContain('family=technical');
		expect(fifthUrl).toContain('stage=promoted');
		expect(secondInit).toEqual(
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(thirdInit).toEqual(
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(fourthInit).toEqual(
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(fifthInit).toEqual(
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(confluence?.symbol).toBe('ETHUSDT');
		expect(perp?.kind).toBe('perp_context');
		expect(referenceStack?.kind).toBe('reference_stack');
		expect(marketCap?.kind).toBe('market_cap');
		expect(catalog?.kind).toBe('indicator_catalog');
	});

	it('routes search and runtime traffic through their own plane proxies', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					ok: true,
					owner: 'engine',
					plane: 'search',
					status: 'fact_only',
					generated_at: '2026-04-23T00:00:00Z',
					scan_id: 'scan_1',
					symbol: 'BTCUSDT',
					timeframe: '1h',
					summary: 'ok',
					consensus: 'neutral',
					avg_confidence: 0.4,
					highlights: [],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					ok: true,
					owner: 'engine',
					plane: 'runtime',
					status: 'durable',
					generated_at: '2026-04-23T00:00:00Z',
					capture: {
						id: 'cap_1',
						created_at: '2026-04-23T00:00:00Z',
					},
				}),
			);

		const scan = await postSearchScanProxy(fetchMock as typeof fetch, {
			symbol: 'BTCUSDT',
			timeframe: '1h',
		});
		const capture = await fetchRuntimeCaptureProxy(fetchMock as typeof fetch, 'cap_1');

		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			'/api/search/scan',
			expect.objectContaining({
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1h' }),
				signal: expect.any(AbortSignal),
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'/api/runtime/captures/cap_1',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(scan?.scan_id).toBe('scan_1');
		expect(capture?.capture.id).toBe('cap_1');
	});
});
