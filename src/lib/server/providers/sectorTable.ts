// ---------------------------------------------------------------------------
// Internal sector taxonomy (B14)
// ---------------------------------------------------------------------------
//
// A pragmatic 7-bucket classification of the USDT-perp universe. The goal
// is to give the research view / scanner rotation features a `sector` slot
// in the provenance chain WITHOUT introducing an external dependency (the
// alternative — CoinGecko categories or Messari sector tags — would add a
// rate-limited API call and a nightly refresh path for data that moves
// roughly once a quarter).
//
// Labels are intentionally coarse. The point is "is this a BTC story, an
// L1 rotation, a DeFi story, a meme rotation, or an AI story" — not to
// enumerate every subsector. If a layer wants finer buckets it should
// subclass this map, not reshape it.
//
// Base keys are the stripped symbol (e.g. `BTC`, not `BTCUSDT`) so this
// table can be used for both perpetual universes (where the quote is
// always `USDT`) and spot universes (where the quote varies). The
// quote-pair dimension is a separate concern.
//
// Unknown symbols fall back to `'other'` at the consumer edge — they do
// not appear in the table. Adding a new symbol is a one-line edit here;
// no contract change required.
//
// Composition rule (consumer side):
//
//   sectorOverride.get(base) ?? sectorMap.get(base) ?? 'other'
//
// …where `sectorMap` comes from `readRaw(KnownRawId.SECTOR_MAP)` and
// `sectorOverride` comes from `readRaw(KnownRawId.SECTOR_OVERRIDE)`.
// The override layer currently returns an empty map; a future slice
// will wire it to per-user settings without changing the atom contract.

/**
 * The fixed set of sector labels. A closed union rather than an open
 * string so scanners computing per-sector alpha ranks or rotation
 * signals get exhaustive switch — typos like `'defi '` (trailing
 * space) or `'DEFI'` (wrong case) fail at check time instead of
 * silently missing.
 */
export type SectorLabel =
	| 'btc'
	| 'l1'
	| 'l2'
	| 'defi'
	| 'meme'
	| 'ai'
	| 'other';

/**
 * The base classification table. Tuples rather than an object literal
 * so future additions can preserve source order (readers can scan
 * alphabetically within each sector block without re-sorting) and so
 * duplicate keys would fail noisily at `new Map(...)` construction
 * instead of silently overwriting.
 */
const SECTOR_BASE_TABLE: ReadonlyArray<readonly [string, SectorLabel]> = [
	// Reserve currency
	['BTC', 'btc'],

	// Layer-1 smart contract platforms
	['ETH', 'l1'],
	['SOL', 'l1'],
	['BNB', 'l1'],
	['AVAX', 'l1'],
	['ADA', 'l1'],
	['DOT', 'l1'],
	['NEAR', 'l1'],
	['ATOM', 'l1'],
	['APT', 'l1'],
	['SUI', 'l1'],
	['SEI', 'l1'],
	['TIA', 'l1'],
	['ICP', 'l1'],
	['INJ', 'l1'],
	['TON', 'l1'],
	['TRX', 'l1'],
	['FTM', 'l1'],

	// Layer-2 rollups / scaling
	['MATIC', 'l2'],
	['ARB', 'l2'],
	['OP', 'l2'],
	['STRK', 'l2'],
	['IMX', 'l2'],
	['MANTA', 'l2'],
	['METIS', 'l2'],

	// DeFi blue chips
	['UNI', 'defi'],
	['AAVE', 'defi'],
	['MKR', 'defi'],
	['COMP', 'defi'],
	['CRV', 'defi'],
	['SNX', 'defi'],
	['LDO', 'defi'],
	['GMX', 'defi'],
	['DYDX', 'defi'],
	['PENDLE', 'defi'],
	['JUP', 'defi'],
	['RUNE', 'defi'],
	['CAKE', 'defi'],
	['SUSHI', 'defi'],
	['1INCH', 'defi'],

	// Memes
	['DOGE', 'meme'],
	['SHIB', 'meme'],
	['PEPE', 'meme'],
	['FLOKI', 'meme'],
	['BONK', 'meme'],
	['WIF', 'meme'],
	['BOME', 'meme'],
	['MEME', 'meme'],
	['BRETT', 'meme'],
	['POPCAT', 'meme'],

	// AI / data / compute
	['FET', 'ai'],
	['RENDER', 'ai'],
	['TAO', 'ai'],
	['GRT', 'ai'],
	['OCEAN', 'ai'],
	['AGIX', 'ai'],
	['RLC', 'ai'],
	['WLD', 'ai'],
	['AKT', 'ai'],
	['ARKM', 'ai']
];

/**
 * The frozen source-of-truth map. Module-scoped and readonly so the
 * adapter returns a fresh mutable copy on every call (consumers can
 * then union-merge with their own extras without poisoning this).
 */
export const SECTOR_MAP_FROZEN: ReadonlyMap<string, SectorLabel> = new Map(SECTOR_BASE_TABLE);

/**
 * Placeholder for per-user sector overrides. Empty today; a future
 * slice will swap the fetcher body in `rawSources.ts` to read from
 * the user settings store without touching this module or changing
 * the atom contract.
 */
export const SECTOR_OVERRIDE_EMPTY: ReadonlyMap<string, SectorLabel> = new Map();
