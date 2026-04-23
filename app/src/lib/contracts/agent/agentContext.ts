import type { FactSnapshot } from '../facts/factSnapshot';
import type { RuntimePlaneState } from '../runtime/captures';
import type { ScanResult } from '../search/scan';
import type { SeedSearchResult } from '../search/seedSearch';

export interface AgentContextEvidence {
	metric: string;
	value: string;
	state?: string | null;
}

export interface AgentContextCompareItem {
	kind: string;
	id: string;
	summary: string;
}

export interface AgentContextRuntimeCaptureSummary {
	id: string;
	kind: string;
	symbol: string;
	timeframe: string;
	status: string;
	captured_at_ms: number;
	pattern_slug?: string | null;
	phase?: string | null;
	user_note?: string | null;
	scan_id?: string | null;
	candidate_id?: string | null;
	verdict_id?: string | null;
	outcome_id?: string | null;
}

export interface AgentContextRuntimeSummary {
	status: RuntimePlaneState | 'unavailable';
	generated_at?: string | null;
	captures: AgentContextRuntimeCaptureSummary[];
}

export interface AgentContextPack {
	symbol: string;
	timeframe: string;
	decision?: {
		direction?: string | null;
		confidence?: string | null;
		reason?: string | null;
	};
	evidence?: AgentContextEvidence[];
	facts?: FactSnapshot | null;
	scan?: ScanResult | null;
	seed_search?: SeedSearchResult | null;
	runtime?: AgentContextRuntimeSummary;
	compare?: AgentContextCompareItem[];
}
