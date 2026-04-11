// ═══════════════════════════════════════════════════════════════
// Stockclaw — CoinGecko loader (legacy path, re-export shim)
// ═══════════════════════════════════════════════════════════════
//
// The canonical location of every CoinGecko fetcher is now
// `src/lib/server/providers/coingecko.ts`. This file remains for
// backward compatibility: four existing callers (scanEngine.ts,
// marketSnapshotService.ts, providers/registry.ts, and
// /api/coingecko/global) still import from `$lib/server/coingecko`,
// and we do not want to touch all four in the same slice that moves
// the code.
//
// Future slices will migrate each caller to import directly from
// `$lib/server/providers/coingecko`, then this shim will be deleted.
// See `docs/exec-plans/active/trunk-plan.dag.json` P1.A0-coingecko.

export {
	fetchCoinGeckoGlobal,
	fetchStablecoinMcap
} from './providers/coingecko';
export type { CoinGeckoGlobal, StablecoinMcap } from './providers/coingecko';
