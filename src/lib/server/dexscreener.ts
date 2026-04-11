// ═══════════════════════════════════════════════════════════════
// Stockclaw — DexScreener loader (legacy path, re-export shim)
// ═══════════════════════════════════════════════════════════════
//
// The canonical location of every DexScreener fetcher is now
// `src/lib/server/providers/dexscreener.ts`. This file remains for
// backward compatibility: eleven existing route callers under
// `src/routes/api/market/dex/**` still import from
// `$lib/server/dexscreener`, and we do not want to touch all
// eleven in the same slice that moves the code.
//
// Future slices will migrate each route to import directly from
// `$lib/server/providers/dexscreener`, then this shim will be
// deleted. See `docs/exec-plans/active/trunk-plan.dag.json`
// P1.A0-dexscreener.

export {
	fetchDexTokenProfilesLatest,
	fetchDexCommunityTakeoversLatest,
	fetchDexAdsLatest,
	fetchDexTokenBoostsLatest,
	fetchDexTokenBoostsTop,
	fetchDexOrders,
	fetchDexPair,
	searchDexPairs,
	fetchDexTokenPairs,
	fetchDexTokens
} from './providers/dexscreener';
export type {
	DexScreenerLink,
	DexTokenProfile,
	DexCommunityTakeover,
	DexAd
} from './providers/dexscreener';
