import type { RuntimePlaneState } from './captures';

export interface ResearchContextRecord {
	id: string;
	title?: string | null;
	summary?: string | null;
	fact_refs?: string[];
	search_refs?: string[];
	payload?: Record<string, unknown>;
	updated_at: string;
}

export interface RuntimeResearchContextResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'runtime';
	status: RuntimePlaneState;
	generated_at: string;
	research_context: ResearchContextRecord;
}
