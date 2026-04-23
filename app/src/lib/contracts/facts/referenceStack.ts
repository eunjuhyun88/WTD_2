import type { FactPlaneState } from './factSnapshot';

export interface ReferenceStackEntry {
	id: string;
	label?: string | null;
	status: FactPlaneState;
	summary?: string | null;
}

export interface ReferenceStackSnapshot {
	ok: boolean;
	owner: 'engine';
	plane: 'fact';
	status: FactPlaneState;
	generated_at: string;
	entries: ReferenceStackEntry[];
	summary?: string | null;
}
