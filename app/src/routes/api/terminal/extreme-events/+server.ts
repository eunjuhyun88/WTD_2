/**
 * GET /api/terminal/extreme-events — proxy to engine /extreme-events (W-0355).
 *
 * Query params forwarded to engine:
 *   since  — lookback window (default 24h)
 *   limit  — max items (default 20, capped at 20 for IntelPanel)
 *   kind   — funding | oi | price | all
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchExtremeEvents } from '$lib/server/extremeEvents';

export const GET: RequestHandler = async ({ url }) => {
	const since = url.searchParams.get('since') ?? '24h';
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 20);
	const kind = url.searchParams.get('kind') ?? 'all';

	try {
		const data = await fetchExtremeEvents({ since, limit, kind });
		return json({ ok: true, data });
	} catch {
		return json({ ok: false, data: { items: [], generated_at: Date.now() } }, { status: 500 });
	}
};
