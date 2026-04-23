import type { RuntimePlaneState } from './captures';

export interface LedgerRecord {
	id: string;
	kind?: string | null;
	subject_id?: string | null;
	verdict?: string | null;
	outcome?: string | null;
	summary?: string | null;
	payload?: Record<string, unknown>;
	updated_at: string;
}

export interface RuntimeLedgerResponse {
	ok: boolean;
	owner: 'engine';
	plane: 'runtime';
	status: RuntimePlaneState;
	generated_at: string;
	ledger: LedgerRecord;
}
