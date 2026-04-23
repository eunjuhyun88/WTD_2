import type { FactPlaneState } from './factSnapshot';

export interface ReferenceStackSource {
	id: string;
	state: FactPlaneState;
	rows?: number | null;
	summary?: string | null;
}

export interface ReferenceStackSnapshot {
	ok: boolean;
	owner: 'engine';
	plane: 'fact';
	kind: 'reference_stack';
	status: FactPlaneState;
	generated_at: string;
	symbol?: string | null;
	timeframe?: string | null;
	sources: ReferenceStackSource[];
	coverage?: {
		live?: number | null;
		partial?: number | null;
		blocked?: number | null;
		missing?: number | null;
		usable_now?: number | null;
		coverage_pct?: number | null;
	};
	catalogCounts?: Record<string, unknown> | null;
	notes?: string[];
}
