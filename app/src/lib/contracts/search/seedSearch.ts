import type { SearchCandidate, SearchPlaneState } from './scan';
import type { SearchQuerySpec } from './querySpec';

export type PromotionGateResult = {
  decision: 'promote_candidate' | 'reject' | string;
  decisionPath: 'strict' | 'trading_edge' | 'rejected' | string;
  canonicalFeatureScore: number | null;
  referenceRecall: number;
  phaseFidelity: number;
  entryProfitableRate: number | null;
  gateResults: Record<string, boolean>;
  rejectionReasons: string[];
};

export interface SeedSearchRequest {
	symbol?: string | null;
	timeframe?: string | null;
	signature?: Record<string, unknown>;
	limit?: number;
}

export type SeedSearchCandidate = SearchCandidate;

export interface SeedSearchResult {
	ok: boolean;
	owner: 'engine';
	plane: 'search';
	status: SearchPlaneState;
	generated_at: string;
	run_id: string;
	request: Record<string, unknown>;
	candidates: SeedSearchCandidate[];
	search_query_spec?: SearchQuerySpec | null;
}
