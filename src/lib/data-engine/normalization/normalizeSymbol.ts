// ═══════════════════════════════════════════════════════════════
// Data Engine — Symbol Normalization
// ═══════════════════════════════════════════════════════════════
//
// Normalize trading pair symbols to canonical format.
//
// Canonical format: BTCUSDT (uppercase, no separators)
//
// Input formats handled:
//   'BTC/USDT'       → 'BTCUSDT'
//   'btcusdt'        → 'BTCUSDT'
//   'BTC-USDT'       → 'BTCUSDT'
//   'BTC_USDT'       → 'BTCUSDT'
//   'BTCUSDT_PERP.A' → 'BTCUSDT'  (Coinalyze format)
//   'BTCUSD_PERP'    → 'BTCUSDT'  (coin-margined → linear)
//   'BTC'            → 'BTCUSDT'  (bare asset → append USDT)

/**
 * Normalize a trading pair symbol to canonical BTCUSDT format.
 *
 * @param input - Raw symbol string from any provider.
 * @returns Uppercase symbol with no separators, USDT-quoted.
 */
export function normalizeSymbol(input: string): string {
	if (!input) return 'BTCUSDT';

	let s = input.trim().toUpperCase();

	// Strip Coinalyze suffixes: _PERP.A, _PERP.B, _PERP
	s = s.replace(/_PERP\.[A-Z]$/, '').replace(/_PERP$/, '');

	// Remove separators: /, -, _
	s = s.replace(/[\/\-_]/g, '');

	// If it ends with USD but not USDT, append T
	if (s.endsWith('USD') && !s.endsWith('USDT')) {
		s = s + 'T';
	}

	// If no quote asset detected, append USDT
	if (!s.endsWith('USDT') && !s.endsWith('BUSD') && !s.endsWith('USDC')) {
		// Only append if it looks like a bare asset (3-5 chars)
		if (s.length <= 5) {
			s = s + 'USDT';
		}
	}

	return s;
}
