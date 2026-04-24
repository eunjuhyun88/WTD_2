import type { SearchCandidate, SearchPlaneState } from './scan';

export interface SeedSearchRequest {
	symbol?: string;
	timeframe?: string;
	signature?: Record<string, unknown>;
	limit?: number;
}

export interface SeedSearchResult {
	ok: boolean;
	owner: 'engine';
	plane: 'search';
	status: SearchPlaneState;
	generated_at: string;
	run_id: string;
	request?: Record<string, unknown>;
	candidates: SearchCandidate[];
}
