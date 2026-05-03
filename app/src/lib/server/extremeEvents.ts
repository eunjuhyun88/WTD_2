/**
 * Server-side fetch wrapper for the engine /extreme-events endpoint (W-0355).
 *
 * Usage (server-side only, e.g. in +page.server.ts or API route):
 *   import { fetchExtremeEvents, type ExtremeEventItem } from '$lib/server/extremeEvents';
 *   const { items } = await fetchExtremeEvents({ since: '24h', limit: 5 });
 */

import { ENGINE_URL, buildEngineHeaders } from '$lib/server/engineTransport';

export interface ExtremeEventItem {
	symbol: string;
	kind: 'funding' | 'oi' | 'price' | string;
	magnitude: number;
	detected_at: string; // ISO-8601
	outcome_24h: number | null;
	outcome_48h: number | null;
	outcome_72h: number | null;
	is_predictive: boolean | null;
}

export interface ExtremeEventsResult {
	items: ExtremeEventItem[];
	generated_at: number; // unix ms
}

export interface FetchExtremeEventsOptions {
	/** Lookback window, e.g. "24h" (default), "48h", "72h" */
	since?: string;
	/** Max results (default 20, max 100) */
	limit?: number;
	/** Filter by kind: "funding" | "oi" | "price" | "all" (default "all") */
	kind?: string;
}

const TIMEOUT_MS = 8_000;

export async function fetchExtremeEvents(
	opts: FetchExtremeEventsOptions = {},
): Promise<ExtremeEventsResult> {
	const { since = '24h', limit = 20, kind = 'all' } = opts;
	const qs = new URLSearchParams({
		since,
		limit: String(limit),
		kind,
	});

	const url = `${ENGINE_URL}/extreme-events?${qs}`;

	try {
		const res = await fetch(url, {
			headers: buildEngineHeaders(),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});

		if (!res.ok) {
			return { items: [], generated_at: Date.now() };
		}

		const data: ExtremeEventsResult = await res.json();
		return data;
	} catch {
		return { items: [], generated_at: Date.now() };
	}
}
