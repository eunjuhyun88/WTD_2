import type { PatternCatalogResponse } from '$lib/contracts/search/catalog';
import type { ScanRequest, ScanResult } from '$lib/contracts/search/scan';
import type { SeedSearchRequest, SeedSearchResult } from '$lib/contracts/search/seedSearch';
import { fetchEnginePlaneJson, postEnginePlaneJson } from './shared';

type ServerFetch = typeof fetch;

export async function fetchSearchCatalogProxy(fetchFn: ServerFetch): Promise<PatternCatalogResponse | null> {
	return fetchEnginePlaneJson<PatternCatalogResponse>(fetchFn, 'search', {
		path: 'catalog',
		timeoutMs: 8_000,
	});
}

export async function postSearchScanProxy(
	fetchFn: ServerFetch,
	request: ScanRequest,
): Promise<ScanResult | null> {
	return postEnginePlaneJson<ScanResult>(fetchFn, 'search', {
		path: 'scan',
		body: request,
		timeoutMs: 30_000,
	});
}

export async function fetchSearchScanRunProxy(
	fetchFn: ServerFetch,
	scanId: string,
): Promise<ScanResult | null> {
	return fetchEnginePlaneJson<ScanResult>(fetchFn, 'search', {
		path: `scan/${scanId}`,
		timeoutMs: 8_000,
	});
}

export async function postSeedSearchProxy(
	fetchFn: ServerFetch,
	request: SeedSearchRequest,
): Promise<SeedSearchResult | null> {
	return postEnginePlaneJson<SeedSearchResult>(fetchFn, 'search', {
		path: 'seed',
		body: request,
		timeoutMs: 30_000,
	});
}

export async function fetchSeedSearchRunProxy(
	fetchFn: ServerFetch,
	runId: string,
): Promise<SeedSearchResult | null> {
	return fetchEnginePlaneJson<SeedSearchResult>(fetchFn, 'search', {
		path: `seed/${runId}`,
		timeoutMs: 8_000,
	});
}
