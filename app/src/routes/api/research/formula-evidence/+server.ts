/**
 * GET /api/research/formula-evidence
 * Proxy → engine GET /research/formula-evidence
 *
 * Query params forwarded: period_days?, min_sample?, limit?
 * Returns FormulaEvidenceItem[] sorted by drag_score DESC.
 *
 * W-0385 PR3.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ url }) => {
	const params = new URLSearchParams();
	for (const key of ['period_days', 'min_sample', 'limit']) {
		const v = url.searchParams.get(key);
		if (v != null) params.set(key, v);
	}

	try {
		const qs = params.toString();
		const res = await engineFetch(`/research/formula-evidence${qs ? `?${qs}` : ''}`);
		const body = await res.json();
		if (!res.ok) {
			return json({ ok: false, error: body?.detail ?? `engine error ${res.status}` }, { status: res.status });
		}
		return json({ ok: true, data: body });
	} catch (err) {
		return json({ ok: false, error: (err as Error).message }, { status: 502 });
	}
};
