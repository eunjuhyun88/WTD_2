/**
 * Active Pair Store — Day-1 market context.
 *
 * Extracted from gameState.ts (Batch 2) to decouple the active
 * terminal/lab/dashboard surfaces from legacy arena/battle state.
 *
 * Contains ONLY the fields that active surfaces need:
 *   pair, timeframe, prices, bases, speed, currentView
 *
 * gameState.ts re-exports these for backward compatibility with
 * legacy code until Batch 3+ archives those consumers.
 */

import { writable, derived } from 'svelte/store';
import type { CanonicalTimeframe } from '$lib/utils/timeframe';
import { normalizeTimeframe } from '$lib/utils/timeframe';
import { STORAGE_KEYS } from './storageKeys';
import { btcPrice, ethPrice, solPrice } from './priceStore';
import { loadFromStorage, autoSave } from '$lib/utils/storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewMode = 'arena' | 'terminal' | 'passport';

export interface ActivePairState {
	/** Currently selected trading pair */
	pair: string;
	/** Currently selected timeframe */
	timeframe: CanonicalTimeframe;
	/** Latest prices for tracked assets */
	prices: { BTC: number; ETH: number; SOL: number };
	/** Baseline prices (snapshot at session start) */
	bases: { BTC: number; ETH: number; SOL: number };
	/** Animation/update speed multiplier */
	speed: number;
	/** Active view mode */
	currentView: ViewMode;
}

// ---------------------------------------------------------------------------
// Defaults + persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = STORAGE_KEYS.gameState; // share key for migration compat

const defaultState: ActivePairState = {
	pair: 'BTC/USDT',
	timeframe: '4h',
	prices: { BTC: 97420, ETH: 3481, SOL: 198.46 },
	bases: { BTC: 97420, ETH: 3481, SOL: 198.46 },
	speed: 3,
	currentView: 'arena'
};

function loadState(): ActivePairState {
	const parsed = loadFromStorage<Partial<ActivePairState> | null>(STORAGE_KEY, null);
	if (!parsed) return defaultState;
	return {
		...defaultState,
		pair: typeof parsed.pair === 'string' ? parsed.pair : defaultState.pair,
		timeframe: normalizeTimeframe(parsed.timeframe),
		speed: typeof parsed.speed === 'number' ? parsed.speed : defaultState.speed,
		currentView: parsed.currentView ?? defaultState.currentView
	};
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const activePairState = writable<ActivePairState>(loadState());

// Price sync from priceStore (SSR-safe)
if (typeof window !== 'undefined') {
	derived(
		[btcPrice, ethPrice, solPrice],
		([$btc, $eth, $sol]) => ({ BTC: $btc, ETH: $eth, SOL: $sol })
	).subscribe(p => {
		activePairState.update(s => {
			const nextBtc = p.BTC || s.prices.BTC;
			const nextEth = p.ETH || s.prices.ETH;
			const nextSol = p.SOL || s.prices.SOL;
			if (s.prices.BTC === nextBtc && s.prices.ETH === nextEth && s.prices.SOL === nextSol) return s;
			return { ...s, prices: { BTC: nextBtc, ETH: nextEth, SOL: nextSol } };
		});
	});
}

// Auto-save persistent fields
autoSave(activePairState, STORAGE_KEY, (s) => ({
	pair: s.pair,
	timeframe: s.timeframe,
	speed: s.speed
}), 1000);

// ---------------------------------------------------------------------------
// Derived + helpers
// ---------------------------------------------------------------------------

export const activePair = derived(activePairState, $s => $s.pair);
export const activeTimeframe = derived(activePairState, $s => $s.timeframe);
export const activePrices = derived(activePairState, $s => $s.prices);
export const activeView = derived(activePairState, $s => $s.currentView);

export function setActivePair(pair: string) {
	activePairState.update(s => ({ ...s, pair }));
}

export function setActiveTimeframe(tf: CanonicalTimeframe) {
	activePairState.update(s => ({ ...s, timeframe: normalizeTimeframe(tf) }));
}

export function setActiveView(view: ViewMode) {
	activePairState.update(s => ({ ...s, currentView: view }));
}

export function setActiveSpeed(speed: number) {
	activePairState.update(s => ({ ...s, speed }));
}
