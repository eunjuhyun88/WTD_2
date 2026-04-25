import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildPlaneAppPath,
	handleEnginePlaneRequest,
	isAllowedPlaneProxyPath,
} from './enginePlaneProxy';

describe('enginePlaneProxy', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('builds plane-specific app paths', () => {
		expect(buildPlaneAppPath('facts', 'ctx/fact')).toBe('/api/facts/ctx/fact');
		expect(buildPlaneAppPath('search', '/scan/abc/')).toBe('/api/search/scan/abc');
	});

	it('allowlists only plane-owned paths', () => {
		expect(isAllowedPlaneProxyPath('facts', 'ctx/fact', 'GET')).toBe(true);
		expect(isAllowedPlaneProxyPath('facts', 'perp-context', 'GET')).toBe(true);
		expect(isAllowedPlaneProxyPath('facts', 'price-context', 'GET')).toBe(true);
		expect(isAllowedPlaneProxyPath('facts', 'scan', 'POST')).toBe(false);
		expect(isAllowedPlaneProxyPath('search', 'scan', 'POST')).toBe(true);
		expect(isAllowedPlaneProxyPath('search', 'scan/scan_1', 'GET')).toBe(true);
		expect(isAllowedPlaneProxyPath('search', 'seed', 'POST')).toBe(true);
		expect(isAllowedPlaneProxyPath('search', 'seed/run_1', 'GET')).toBe(true);
		expect(isAllowedPlaneProxyPath('runtime', 'captures', 'POST')).toBe(true);
		expect(isAllowedPlaneProxyPath('runtime', 'captures', 'GET')).toBe(true);
		expect(isAllowedPlaneProxyPath('runtime', 'ctx/fact', 'GET')).toBe(false);
	});

	it('maps fact routes to engine ctx/facts upstreams', async () => {
		const upstream = new Response(JSON.stringify({ ok: true, plane: 'fact' }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream as never);

		const req = new Request('http://localhost/api/facts/reference-stack?symbol=BTCUSDT', {
			method: 'GET',
		});
		const res = await handleEnginePlaneRequest(
			{ request: req, params: { path: 'reference-stack' } } as any,
			'facts',
			'GET',
		);

		expect(res.status).toBe(200);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'http://localhost:8000/facts/reference-stack?symbol=BTCUSDT',
			expect.objectContaining({
				method: 'GET',
				headers: expect.any(Headers),
			}),
		);
		expect(res.headers.get('x-wtd-plane')).toBe('fact');
		expect(res.headers.get('x-wtd-upstream')).toBe('facts/reference-stack');
	});

	it('maps fact perp-context routes to canonical /facts upstreams', async () => {
		const upstream = new Response(JSON.stringify({ ok: true, plane: 'fact', kind: 'perp_context' }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream as never);

		const req = new Request('http://localhost/api/facts/perp-context?symbol=BTCUSDT&timeframe=4h', {
			method: 'GET',
		});
		const res = await handleEnginePlaneRequest(
			{ request: req, params: { path: 'perp-context' } } as any,
			'facts',
			'GET',
		);

		expect(res.status).toBe(200);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'http://localhost:8000/facts/perp-context?symbol=BTCUSDT&timeframe=4h',
			expect.objectContaining({
				method: 'GET',
				headers: expect.any(Headers),
			}),
		);
		expect(res.headers.get('x-wtd-upstream')).toBe('facts/perp-context');
	});

	it('maps search POST routes to canonical /search upstreams', async () => {
		const upstream = new Response(JSON.stringify({ ok: true, plane: 'search' }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream as never);

		const req = new Request('http://localhost/api/search/scan', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1h' }),
		});
		const res = await handleEnginePlaneRequest(
			{
				request: req,
				params: { path: 'scan' },
				getClientAddress: () => '127.0.0.1',
			} as any,
			'search',
			'POST',
		);

		expect(res.status).toBe(200);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'http://localhost:8000/search/scan',
			expect.objectContaining({
				method: 'POST',
				headers: expect.any(Headers),
			}),
		);
	});

	it('rejects runtime paths that are not explicitly owned', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const req = new Request('http://localhost/api/runtime/verdicts/abc', { method: 'GET' });
		const res = await handleEnginePlaneRequest(
			{ request: req, params: { path: 'verdicts/abc' } } as any,
			'runtime',
			'GET',
		);

		expect(res.status).toBe(404);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
