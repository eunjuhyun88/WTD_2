export type PriceLikeEntry = number | { price?: number | null } | null | undefined;
export type PriceLikeMap = Record<string, PriceLikeEntry>;

const QUOTE_SUFFIXES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USDP', 'USD', 'PERP'] as const;

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function getBaseSymbolFromPair(pair: string): string {
  const raw = normalizeSymbol(pair);
  if (!raw) return '';

  if (raw.includes('/')) return normalizeSymbol(raw.split('/')[0] ?? '');
  if (raw.includes('-')) return normalizeSymbol(raw.split('-')[0] ?? '');
  if (raw.includes('_')) return normalizeSymbol(raw.split('_')[0] ?? '');

  for (const suffix of QUOTE_SUFFIXES) {
    if (raw.endsWith(suffix) && raw.length > suffix.length) {
      return raw.slice(0, -suffix.length);
    }
  }
  return raw;
}

function normalizePrice(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function readPrice(entry: PriceLikeEntry): number | null {
  if (entry == null) return null;
  if (typeof entry === 'number') return normalizePrice(entry);
  if (typeof entry === 'object' && 'price' in entry) return normalizePrice(entry.price);
  return null;
}

export function toNumericPriceMap(input: PriceLikeMap): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [rawSym, rawEntry] of Object.entries(input)) {
    const symbol = normalizeSymbol(rawSym);
    if (!symbol) continue;
    const price = readPrice(rawEntry);
    if (price === null) continue;
    result[symbol] = price;
  }
  return result;
}

export function buildPriceMapHash(prices: Record<string, number>): string {
  const sorted = Object.entries(prices)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([symbol, value]) => `${symbol}:${value}`).join('|');
}
