import type { FactPlaneState } from './factSnapshot';

export type IndicatorCatalogStatus = 'live' | 'partial' | 'blocked' | 'missing';

export interface IndicatorCatalogEntry {
	id: string;
	label: string;
	family: string;
	status: IndicatorCatalogStatus;
	primary_sources: string[];
	current_owner: 'engine' | 'app_bridge' | 'none';
	summary?: string | null;
}

export interface IndicatorCatalogResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'fact';
	status: FactPlaneState;
	generated_at: string;
	coverage: Record<IndicatorCatalogStatus, number>;
	entries: IndicatorCatalogEntry[];
}
