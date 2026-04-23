export type FactPlaneState =
	| 'ok'
	| 'live'
	| 'blocked'
	| 'reference_only'
	| 'stale'
	| 'degraded'
	| 'transitional';

export interface FactSourceState {
	status: FactPlaneState | 'error';
	summary?: string | null;
	updated_at?: string | null;
}

export interface CompactConfluenceSummary {
	score?: number | null;
	verdict?: string | null;
	confidence?: number | null;
	regime?: string | null;
}

export interface ReferenceHealthSummary {
	live?: number | null;
	blocked?: number | null;
	reference_only?: number | null;
	stale?: number | null;
}

export interface FactSnapshot {
	ok: boolean;
	owner: 'engine';
	plane: 'fact';
	status: FactPlaneState;
	generated_at: string;
	fact_id?: string | null;
	symbol?: string | null;
	timeframe?: string | null;
	provider_state?: Record<string, FactSourceState>;
	sources?: Record<string, FactSourceState>;
	confluence?: CompactConfluenceSummary | null;
	reference_health?: ReferenceHealthSummary | null;
}
