import type { SearchPlaneState } from './scan';

export interface SearchCorpusWindowSummary {
	window_id: string;
	symbol: string;
	timeframe: string;
	start_ts: string;
	end_ts: string;
	bars: number;
	source: string;
	signature: Record<string, unknown>;
}

export type PatternCatalogEntry = SearchCorpusWindowSummary;

export interface SearchCorpusCatalogResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'search';
	status: SearchPlaneState;
	generated_at: string;
	total_windows: number;
	windows: SearchCorpusWindowSummary[];
}

export type PatternCatalogResponse = SearchCorpusCatalogResponse;
