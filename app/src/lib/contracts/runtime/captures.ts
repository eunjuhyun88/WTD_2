export type RuntimePlaneState = 'durable' | 'fallback_local' | 'read_only';

export interface CaptureRecord {
	capture_id: string;
	capture_kind: string;
	user_id?: string | null;
	symbol: string;
	pattern_slug?: string;
	pattern_version?: number;
	phase?: string;
	timeframe: string;
	captured_at_ms: number;
	candidate_transition_id?: string | null;
	candidate_id?: string | null;
	scan_id?: string | null;
	user_note?: string | null;
	chart_context: Record<string, unknown>;
	research_context?: Record<string, unknown> | null;
	feature_snapshot?: Record<string, unknown> | null;
	block_scores: Record<string, unknown>;
	verdict_id?: string | null;
	outcome_id?: string | null;
	status: string;
}

export interface RuntimeCaptureResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'runtime';
	status: RuntimePlaneState;
	generated_at: string;
	capture: CaptureRecord;
}

export interface RuntimeCaptureListResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'runtime';
	status: RuntimePlaneState;
	generated_at: string;
	captures: CaptureRecord[];
	count: number;
}
