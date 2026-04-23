export type SearchPlaneState =
	| 'live'
	| 'empty'
	| 'corpus_only'
	| 'fact_only'
	| 'degraded'
	| 'blocked';

export interface ScanRequest {
	symbol?: string | null;
	timeframe?: string | null;
	limit?: number;
}

export interface SearchCandidate {
	candidate_id: string;
	window_id?: string | null;
	symbol?: string | null;
	timeframe?: string | null;
	score: number;
	payload: Record<string, unknown>;
}

export interface ScanResult {
	ok: boolean;
	owner: 'engine';
	plane: 'search';
	status: SearchPlaneState;
	generated_at: string;
	scan_id: string;
	request: Record<string, unknown>;
	candidates: SearchCandidate[];
}
