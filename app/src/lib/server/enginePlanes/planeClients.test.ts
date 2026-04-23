import { describe, expect, it, vi } from 'vitest';
import {
	fetchFactChainIntelProxy,
	fetchFactConfluenceProxy,
	fetchFactContextProxy,
	fetchIndicatorCatalogProxy,
	fetchFactPerpContextProxy,
} from './facts';
import {
	fetchSeedSearchRunProxy,
	fetchSearchScanRunProxy,
	postSearchScanProxy,
	postSeedSearchProxy,
} from './search';
import { fetchRuntimeCaptureListProxy, fetchRuntimeCaptureProxy } from './runtime';

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

	it('routes fact confluence, reference-stack, perp context, market-cap, and indicator catalog through plane-owned URLs', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/facts/confluence')) {
				return Response.json({
					ok: true,
					symbol: 'ETHUSDT',
					timeframe: '4h',
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
					timeframe: '4h',
					sources: [{ id: 'klines', state: 'live', rows: 600, summary: '600 rows' }],
					coverage: { usable_now: 68, coverage_pct: 68 },
				});
			}
			if (url.startsWith('/api/facts/perp-context')) {
				return Response.json({
					ok: true,
					symbol: 'ETHUSDT',
					timeframe: '4h',
					metrics: {
						funding_rate: -0.0012,
						long_short_ratio: 0.91,
					},
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
		const perp = await fetchFactPerpContextProxy(fetchMock as typeof fetch, {
			symbol: 'ETHUSDT',
			timeframe: '4h',
		});
		const perp = await fetchPerpContextProxy(fetchMock as typeof fetch, {
			symbol: 'ETHUSDT',
			timeframe: '4h',
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
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'/api/facts/perp-context?symbol=ETHUSDT&timeframe=4h&offline=true',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		const thirdUrl = String(fetchMock.mock.calls[2]?.[0]);
		const thirdInit = fetchMock.mock.calls[2]?.[1] as RequestInit | undefined;
		const fourthUrl = String(fetchMock.mock.calls[3]?.[0]);
		const fourthInit = fetchMock.mock.calls[3]?.[1] as RequestInit | undefined;
		const fifthUrl = String(fetchMock.mock.calls[4]?.[0]);
		const fifthInit = fetchMock.mock.calls[4]?.[1] as RequestInit | undefined;
		expect(secondUrl).toBe('/api/facts/reference-stack?symbol=ETHUSDT&timeframe=4h&offline=true');
		expect(thirdUrl).toBe('/api/facts/perp-context?symbol=ETHUSDT&timeframe=4h&offline=true');
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
		expect(referenceStack?.kind).toBe('reference_stack');
		expect(perp?.kind).toBe('perp_context');
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
					request: { symbol: 'BTCUSDT', timeframe: '1h' },
					candidates: [],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					ok: true,
					owner: 'engine',
					plane: 'search',
					status: 'corpus_only',
					generated_at: '2026-04-23T00:00:00Z',
					scan_id: 'scan_1',
					request: { symbol: 'BTCUSDT', timeframe: '1h' },
					candidates: [],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					ok: true,
					owner: 'engine',
					plane: 'search',
					status: 'corpus_only',
					generated_at: '2026-04-23T00:00:00Z',
					run_id: 'run_1',
					request: { symbol: 'BTCUSDT', timeframe: '1h' },
					candidates: [],
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					ok: true,
					owner: 'engine',
					plane: 'search',
					status: 'corpus_only',
					generated_at: '2026-04-23T00:00:00Z',
					run_id: 'run_1',
					request: { symbol: 'BTCUSDT', timeframe: '1h' },
					candidates: [],
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
						capture_id: 'cap_1',
						capture_kind: 'manual_hypothesis',
						symbol: 'BTCUSDT',
						timeframe: '1h',
						captured_at_ms: 1_776_566_400_000,
						chart_context: {},
						block_scores: {},
						status: 'pending_outcome',
					},
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					ok: true,
					owner: 'engine',
					plane: 'runtime',
					status: 'fallback_local',
					generated_at: '2026-04-23T00:00:00Z',
					captures: [
						{
							capture_id: 'cap_1',
							capture_kind: 'manual_hypothesis',
							symbol: 'BTCUSDT',
							timeframe: '1h',
							captured_at_ms: 1_776_566_400_000,
							chart_context: {},
							block_scores: {},
							status: 'pending_outcome',
						},
					],
					count: 1,
				}),
			);

		const scan = await postSearchScanProxy(fetchMock as typeof fetch, {
			symbol: 'BTCUSDT',
			timeframe: '1h',
		});
		const savedScan = await fetchSearchScanRunProxy(fetchMock as typeof fetch, 'scan_1');
		const seed = await postSeedSearchProxy(fetchMock as typeof fetch, {
			symbol: 'BTCUSDT',
			timeframe: '1h',
			signature: { trend: 'up' },
		});
		const savedSeed = await fetchSeedSearchRunProxy(fetchMock as typeof fetch, 'run_1');
		const capture = await fetchRuntimeCaptureProxy(fetchMock as typeof fetch, 'cap_1');
		const captures = await fetchRuntimeCaptureListProxy(fetchMock as typeof fetch, {
			userId: 'user-1',
			symbol: 'BTCUSDT',
			limit: 20,
		});

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
			'/api/search/scan/scan_1',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			3,
			'/api/search/seed',
			expect.objectContaining({
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1h', signature: { trend: 'up' } }),
				signal: expect.any(AbortSignal),
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			4,
			'/api/search/seed/run_1',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			5,
			'/api/runtime/captures/cap_1',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			6,
			'/api/runtime/captures?user_id=user-1&symbol=BTCUSDT&limit=20',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(scan?.scan_id).toBe('scan_1');
		expect(savedScan?.scan_id).toBe('scan_1');
		expect(seed?.run_id).toBe('run_1');
		expect(savedSeed?.run_id).toBe('run_1');
		expect(capture?.capture.capture_id).toBe('cap_1');
		expect(captures?.count).toBe(1);
	});
});
