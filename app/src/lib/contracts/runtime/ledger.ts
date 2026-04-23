import type { RuntimePlaneState } from './captures';

export interface LedgerRecord {
	id: string;
	verdict?: string | null;
	outcome?: string | null;
	summary?: string | null;
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
