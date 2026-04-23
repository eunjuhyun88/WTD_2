import type { FactSnapshot } from '../facts/factSnapshot';
import type { ScanResult } from '../search/scan';
import type { SeedSearchResult } from '../search/seedSearch';

export interface AgentContextEvidence {
	metric: string;
	value: string;
	state?: string | null;
}

export interface AgentContextCompareItem {
	kind: string;
	id: string;
	summary: string;
}

export interface AgentContextPack {
	symbol: string;
	timeframe: string;
	decision?: {
		direction?: string | null;
		confidence?: string | null;
		reason?: string | null;
	};
	evidence?: AgentContextEvidence[];
	facts?: FactSnapshot | null;
	scan?: ScanResult | null;
	seed_search?: SeedSearchResult | null;
	compare?: AgentContextCompareItem[];
}
