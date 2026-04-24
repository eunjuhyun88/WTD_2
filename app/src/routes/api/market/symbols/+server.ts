import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';

// Binance USDT perps exchange info — cached 1 hour server-side
let symbolsCache: { symbols: SymbolEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const POPULAR = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'LTCUSDT', 'UNIUSDT', 'NEARUSDT', 'MATICUSDT', 'AAVEUSDT',
  'SUIUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'ATOMUSDT',
  'INJUSDT', 'TIAUSDT', 'SEIUSDT', 'JUPUSDT', 'WIFUSDT',
  'PEPEUSDT', 'BONKUSDT', 'FLOKIUSDT', 'ORDIUSDT', 'RUNEUSDT',
];

export interface SymbolEntry {
  symbol: string; // e.g. BTCUSDT
  base: string;   // e.g. BTC
}

async function fetchBinanceSymbols(): Promise<SymbolEntry[]> {
  const now = Date.now();
  if (symbolsCache && now - symbolsCache.fetchedAt < CACHE_TTL_MS) {
    return symbolsCache.symbols;
  }

  try {
    const res = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const data = await res.json() as { symbols: Array<{ symbol: string; baseAsset: string; quoteAsset: string; contractType: string; status: string }> };

    const symbols: SymbolEntry[] = data.symbols
      .filter(s => s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL' && s.status === 'TRADING')
      .map(s => ({ symbol: s.symbol, base: s.baseAsset }));

    // Sort: popular first, then alphabetical
    const popularSet = new Set(POPULAR);
    symbols.sort((a, b) => {
      const ai = POPULAR.indexOf(a.symbol);
      const bi = POPULAR.indexOf(b.symbol);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.symbol.localeCompare(b.symbol);
    });

    symbolsCache = { symbols, fetchedAt: now };
    return symbols;
  } catch {
    // Fallback to static popular list on error
    return POPULAR.map(s => ({ symbol: s, base: s.replace('USDT', '') }));
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim().toUpperCase();
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '40', 10), 100);

  const all = await fetchBinanceSymbols();

  let results = all;
  if (q) {
    // Match base or full symbol — prefix match scores higher
    results = all.filter(s => s.symbol.includes(q) || s.base.includes(q));
    // Stable sort: prefix matches first
    results.sort((a, b) => {
      const aPrefix = a.base.startsWith(q) || a.symbol.startsWith(q) ? 0 : 1;
      const bPrefix = b.base.startsWith(q) || b.symbol.startsWith(q) ? 0 : 1;
      return aPrefix - bPrefix;
    });
  }

  return json(
    { symbols: results.slice(0, limit) },
    { headers: buildPublicCacheHeaders({ browserMaxAge: 30, staleWhileRevalidate: 60 }) },
  );
};
