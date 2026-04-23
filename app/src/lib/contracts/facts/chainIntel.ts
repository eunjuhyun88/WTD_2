import type { FactPlaneState, FactSourceState } from './factSnapshot';

export interface ChainIntelSnapshot {
	ok: boolean;
	owner: 'engine';
	plane: 'fact';
	kind: 'chain_intel';
	status: FactPlaneState;
	generated_at: string;
	symbol?: string | null;
	timeframe?: string | null;
	chain?: string | null;
	family?: string | null;
	provider_state?: Record<string, FactSourceState>;
	source?: {
		id: string;
		state: FactPlaneState;
		rows?: number | null;
		summary?: string | null;
	};
	summary?: string | null;
	notes?: string[];
}
