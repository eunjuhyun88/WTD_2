import type { SearchPlaneState } from './scan';

export interface PatternCatalogEntry {
	slug: string;
	family?: string | null;
	label: string;
	maturity?: string | null;
	summary?: string | null;
}

export interface PatternCatalogResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'search';
	status: SearchPlaneState;
	generated_at: string;
	entries: PatternCatalogEntry[];
}
