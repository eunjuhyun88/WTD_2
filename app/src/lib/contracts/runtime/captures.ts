export type RuntimePlaneState = 'durable' | 'fallback_local' | 'read_only';

export interface CaptureRecord {
	id: string;
	symbol?: string | null;
	timeframe?: string | null;
	created_at: string;
	summary?: string | null;
	fact_ref?: string | null;
	search_ref?: string | null;
}

export interface RuntimeCaptureResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'runtime';
	status: RuntimePlaneState;
	generated_at: string;
	capture: CaptureRecord;
}
