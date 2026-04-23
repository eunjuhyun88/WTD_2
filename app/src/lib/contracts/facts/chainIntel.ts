import type { FactPlaneState, FactSourceState } from './factSnapshot';

export interface ChainIntelSnapshot {
	ok: boolean;
	owner: 'engine';
	plane: 'fact';
	status: FactPlaneState;
	generated_at: string;
	symbol?: string | null;
	chain?: string | null;
	family?: string | null;
	provider_state?: Record<string, FactSourceState>;
	summary?: string | null;
}
