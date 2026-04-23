import { describe, expect, it, vi } from 'vitest';
import {
	fetchFactConfluenceProxy,
	fetchFactContextProxy,
	fetchIndicatorCatalogProxy,
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

	it('routes fact confluence and indicator catalog through plane-owned URLs', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/facts/confluence')) {
				return Response.json({
					ok: true,
					symbol: 'ETHUSDT',
					timeframe: '4h',
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
		expect(secondUrl.startsWith('/api/facts/indicator-catalog?')).toBe(true);
		expect(secondUrl).toContain('family=technical');
		expect(secondUrl).toContain('stage=promoted');
		expect(secondInit).toEqual(
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(confluence?.symbol).toBe('ETHUSDT');
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
