/**
 * GET /api/captures/watch-hits
 *
 * Returns pending_outcome captures that originated from a watch-hit scan.
 * Used by VerdictInboxPanel to show the "Watch Hits — Pending Outcome" section.
 *
 * Query params:
 *   limit  — max rows (default 30)
 *
 * Filters applied (app-side):
 *   - status === 'pending_outcome'
 *   - research_context.source === 'watch_scan'
 *   - created within the last 24h (captures older than that are not actionable)
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

export const config = {
	runtime: 'nodejs22.x',
	regions: ['iad1'],
	memory: 256,
	maxDuration: 10,
};

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export const GET: RequestHandler = async ({ url, cookies }) => {
	const user = await getAuthUserFromCookies(cookies);
	if (!user) throw error(401, 'Authentication required');

	const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

	const params = new URLSearchParams({
		status: 'pending_outcome',
		user_id: user.id,
		limit: String(Math.min(limit, 200)),
	});

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 8_000);

	try {
		const res = await engineFetch(`/captures?${params}`, {
			method: 'GET',
			headers: { accept: 'application/json' },
			signal: controller.signal,
		});

		if (!res.ok) {
			const txt = await res.text().catch(() => '');
			throw error(res.status, txt || 'Engine error');
		}

		const data = (await res.json()) as { captures?: Array<Record<string, unknown>> };
		const allPending = data.captures ?? [];

		const cutoffMs = Date.now() - WINDOW_MS;
		const watchHits = allPending.filter((c) => {
			const rc = c.research_context as Record<string, unknown> | null | undefined;
			const capturedMs = (c.captured_at_ms as number | undefined) ?? 0;
			return rc?.source === 'watch_scan' && capturedMs >= cutoffMs;
		});

		return json({
			ok: true,
			items: watchHits,
			count: watchHits.length,
		});
	} finally {
		clearTimeout(timeout);
	}
};
