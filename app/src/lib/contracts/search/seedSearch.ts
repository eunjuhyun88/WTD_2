import type { SearchPlaneState } from './scan';

export interface SeedSearchRequest {
	symbol: string;
	timeframe: string;
	range_start_ms: number;
	range_end_ms: number;
	limit?: number;
}

export interface SeedSearchCandidate {
	id: string;
	symbol: string;
	timeframe: string;
	score: number;
	summary: string;
}

export interface SeedSearchResult {
	ok: boolean;
	owner: 'engine';
	plane: 'search';
	status: SearchPlaneState;
	generated_at: string;
	run_id: string;
	summary: string;
	candidates: SeedSearchCandidate[];
}
