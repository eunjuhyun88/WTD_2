import type { EnginePlaneProxyName } from '$lib/server/enginePlaneProxy';
import { buildPlaneAppPath } from '$lib/server/enginePlaneProxy';

type ServerFetch = typeof fetch;
type QueryValue = string | number | boolean | null | undefined;

export interface EnginePlaneRequestOptions {
	path: string;
	query?: Record<string, QueryValue>;
	timeoutMs?: number;
}

function buildQueryString(query: Record<string, QueryValue> | undefined): string {
	if (!query) return '';
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value == null) continue;
		params.set(key, String(value));
	}
	const encoded = params.toString();
	return encoded ? `?${encoded}` : '';
}

export function buildEnginePlaneProxyUrl(
	plane: EnginePlaneProxyName,
	options: EnginePlaneRequestOptions,
): string {
	return `${buildPlaneAppPath(plane, options.path)}${buildQueryString(options.query)}`;
}

export async function fetchEnginePlaneJson<T>(
	fetchFn: ServerFetch,
	plane: EnginePlaneProxyName,
	options: EnginePlaneRequestOptions,
): Promise<T | null> {
	try {
		const res = await fetchFn(buildEnginePlaneProxyUrl(plane, options), {
			signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

export async function postEnginePlaneJson<T>(
	fetchFn: ServerFetch,
	plane: EnginePlaneProxyName,
	options: EnginePlaneRequestOptions & { body: unknown; method?: 'POST' | 'PUT' | 'DELETE' },
): Promise<T | null> {
	try {
		const res = await fetchFn(buildEnginePlaneProxyUrl(plane, options), {
			method: options.method ?? 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(options.body),
			signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}
