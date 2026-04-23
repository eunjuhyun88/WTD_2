export type SearchPlaneState = 'live' | 'corpus_only' | 'fact_only' | 'degraded' | 'blocked';

export interface ScanRequest {
	symbol: string;
	timeframe: string;
	universe?: string[];
	max_candidates?: number;
}

export interface ScanHighlight {
	agent: string;
	vote: string;
	conf: number;
	note: string;
}

export interface ScanResult {
	ok: boolean;
	owner: 'engine';
	plane: 'search';
	status: SearchPlaneState;
	generated_at: string;
	scan_id: string;
	symbol: string;
	timeframe: string;
	summary: string;
	consensus: 'long' | 'short' | 'neutral';
	avg_confidence: number;
	highlights: ScanHighlight[];
	pattern_context?: {
		slug: string;
		family?: string | null;
		maturity?: string | null;
		candidate_status?: string | null;
	} | null;
}
