import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../+server';

vi.mock('$lib/server/engineTransport', () => ({
	engineFetch: vi.fn(),
}));

vi.mock('$lib/server/authGuard', () => ({
	getAuthUserFromCookies: vi.fn(),
}));

import { engineFetch } from '$lib/server/engineTransport';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

const mockEngFetch = vi.mocked(engineFetch);
const mockAuthGuard = vi.mocked(getAuthUserFromCookies);

const MOCK_USER = { id: 'user-abc', email: 'test@example.com' };

function makeEvent(params: { weeks?: string } = {}, cookies?: Record<string, string>) {
	const url = new URL('http://localhost/api/dashboard/wvpl');
	if (params.weeks) url.searchParams.set('weeks', params.weeks);
	return {
		url,
		cookies: {
			get: (k: string) => cookies?.[k] ?? undefined,
		},
	} as any;
}

describe('GET /api/dashboard/wvpl', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns 401 when unauthenticated (AC2)', async () => {
		mockAuthGuard.mockResolvedValue(null);
		const res = await GET(makeEvent());
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toMatch(/auth/i);
	});

	it('proxies engine response when authenticated (AC2)', async () => {
		mockAuthGuard.mockResolvedValue(MOCK_USER as any);
		const payload = { weeks: [{ week_start: '2026-04-20', loop_count: 3 }] };
		mockEngFetch.mockResolvedValue(
			new Response(JSON.stringify(payload), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		);

		const res = await GET(makeEvent());
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json');
		const body = await res.json();
		expect(body.weeks[0].loop_count).toBe(3);
	});

	it('clamps weeks param to MAX_WEEKS=52 (AC2)', async () => {
		mockAuthGuard.mockResolvedValue(MOCK_USER as any);
		mockEngFetch.mockResolvedValue(new Response('{}', { status: 200 }));

		await GET(makeEvent({ weeks: '999' }));

		const [calledPath] = mockEngFetch.mock.calls[0]!;
		expect(calledPath).toContain('weeks=52');
	});

	it('forwards x-user-id header to engine (AC2)', async () => {
		mockAuthGuard.mockResolvedValue(MOCK_USER as any);
		mockEngFetch.mockResolvedValue(new Response('{}', { status: 200 }));

		await GET(makeEvent());

		const [, init] = mockEngFetch.mock.calls[0]!;
		expect(new Headers(init?.headers as HeadersInit).get('x-user-id')).toBe(MOCK_USER.id);
	});
});
