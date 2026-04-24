import type { FactPlaneState } from './factSnapshot';

export type IndicatorCatalogStatus = 'live' | 'partial' | 'blocked' | 'missing';
export type IndicatorCatalogOwner = 'engine' | 'app_bridge' | 'none';
export type IndicatorCatalogPromotionStage = 'cataloged' | 'readable' | 'operational' | 'promoted';

export interface IndicatorCatalogEntry {
	id: string;
	label: string;
	family:
		| 'technical'
		| 'derivatives'
		| 'onchain'
		| 'defi_dex'
		| 'options'
		| 'macro'
		| 'social_tokenomics';
	status: IndicatorCatalogStatus;
	primary_sources: string[];
	current_owner: IndicatorCatalogOwner;
	promotion_stage: IndicatorCatalogPromotionStage;
	next_gate: string;
	notes: string;
}

export interface IndicatorCatalogFilters {
	status?: IndicatorCatalogStatus | null;
	family?: IndicatorCatalogEntry['family'] | null;
	stage?: IndicatorCatalogPromotionStage | null;
	query?: string | null;
}

export interface IndicatorCatalogResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'fact';
	kind: 'indicator_catalog';
	status: FactPlaneState;
	generated_at: string;
	total: number;
	matched: number;
	filters: IndicatorCatalogFilters;
	coverage: {
		live: number;
		partial: number;
		usable_now: number;
		coverage_pct: number;
	};
	counts: Record<string, Record<string, number>>;
	metrics: IndicatorCatalogEntry[];
	notes: string[];
}
