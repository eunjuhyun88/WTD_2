import type { FactPlaneState } from './factSnapshot';

export interface ConfluenceContribution {
	id: string;
	state?: FactPlaneState;
	summary?: string | null;
	score?: number | null;
}

export interface ConfluenceResult {
	ok: boolean;
	owner: 'engine';
	plane: 'fact';
	status: FactPlaneState;
	generated_at: string;
	symbol?: string | null;
	timeframe?: string | null;
	verdict?: string | null;
	score?: number | null;
	confidence?: number | null;
	contributions?: ConfluenceContribution[];
}
