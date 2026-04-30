/**
 * Futures → Spot symbol mapping for Binance.
 * Handles 1000-prefix tokens (e.g. 1000PEPEUSDT → PEPEUSDT).
 */

const OVERRIDE: Record<string, string> = {
  '1000PEPEUSDT': 'PEPEUSDT',
  '1000SHIBUSDT': 'SHIBUSDT',
  '1000BONKUSDT': 'BONKUSDT',
  '1000FLOKIUSDT': 'FLOKIUSDT',
  '1000LUNCUSDT': 'LUNCUSDT',
  '1000RATSUSDT': 'RATSUSDT',
  '1000SATSUSDT': 'SATSUSDT',
  '1000XECUSDT': 'XECUSDT',
};

/** Convert a Binance Futures symbol to its Spot equivalent. Returns null if no spot listing expected. */
export function futuresToSpot(symbol: string): string {
  const upper = symbol.toUpperCase();
  return OVERRIDE[upper] ?? upper;
}

/** Coinbase product IDs — only BTC and ETH have meaningful premium data */
export const COINBASE_PRODUCT_MAP: Record<string, string> = {
  BTCUSDT: 'BTC-USD',
  ETHUSDT: 'ETH-USD',
};
