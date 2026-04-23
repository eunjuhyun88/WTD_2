import type { FactPlaneState } from './factSnapshot';

export interface MarketCapSnapshot {
	ok: boolean;
	owner: 'engine';
	plane: 'fact';
	status: FactPlaneState;
	generated_at: string;
	total_market_cap?: number | null;
	btc_dominance?: number | null;
	stablecoin_market_cap?: number | null;
	summary?: string | null;
}
