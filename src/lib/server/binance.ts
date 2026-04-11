// ═══════════════════════════════════════════════════════════════
// Stockclaw — Binance loader (legacy path, re-export shim)
// ═══════════════════════════════════════════════════════════════
//
// The canonical location of every Binance fetcher is now
// `src/lib/server/providers/binance.ts`. This file remains for
// backward compatibility: six existing callers (scanEngine.ts,
// multiTimeframeContext.ts, marketSnapshotService.ts,
// providers/rawSources.ts, providers/registry.ts, and the
// /api/market/flow route) still import from `$lib/server/binance`,
// and we do not want to touch all six in the same slice that moves
// the code.
//
// Future slices will migrate each caller to import directly from
// `$lib/server/providers/binance`, then this shim will be deleted.
// See `docs/exec-plans/active/trunk-plan.dag.json` P1.A0-binance and
// the three-pipeline trunk plan §Phase 1 A-P0.

export {
	fetchKlinesServer,
	fetch24hrServer,
	pairToSymbol
} from './providers/binance';
export type { BinanceKline, Binance24hr } from './providers/binance';
