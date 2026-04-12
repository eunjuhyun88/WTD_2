import { fetchPrices, fetch24hrMulti, subscribeMiniTicker, type Binance24hr } from '$lib/api/binance';
import { updatePrice, updatePrices as updatePriceStore, updatePriceFull } from '$lib/stores/priceStore';
import { gameState } from '$lib/stores/gameState';

const TRACKED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const SYMBOL_MAP: Record<string, 'BTC' | 'ETH' | 'SOL'> = {
  BTCUSDT: 'BTC',
  ETHUSDT: 'ETH',
  SOLUSDT: 'SOL'
};

type MiniTickerFull = {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
};

async function bootstrapInitialPrices(): Promise<void> {
  try {
    const [prices, tickers24] = await Promise.all([
      fetchPrices([...TRACKED_SYMBOLS]),
      fetch24hrMulti([...TRACKED_SYMBOLS]).catch(() => [] as Binance24hr[])
    ]);

    const tickerMap = new Map<string, Binance24hr>();
    for (const ticker of tickers24) {
      if (ticker?.symbol) tickerMap.set(ticker.symbol, ticker);
    }

    const updates: Partial<Record<'BTC' | 'ETH' | 'SOL', number>> = {};
    for (const [symbol, price] of Object.entries(prices)) {
      const key = SYMBOL_MAP[symbol];
      if (!key || !Number.isFinite(price) || price <= 0) continue;
      updates[key] = price;

      const ticker24 = tickerMap.get(symbol);
      if (ticker24) {
        updatePriceFull(key, {
          price,
          ts: Date.now(),
          source: 'rest',
          change24h: parseFloat(ticker24.priceChangePercent) || 0,
          high24h: parseFloat(ticker24.highPrice) || 0,
          low24h: parseFloat(ticker24.lowPrice) || 0,
          volume24h: parseFloat(ticker24.quoteVolume) || 0
        });
      } else {
        updatePrice(key, price, 'rest');
      }
    }

    if (Object.keys(updates).length) {
      gameState.update((state) => ({
        ...state,
        bases: {
          BTC: updates.BTC ?? state.bases.BTC,
          ETH: updates.ETH ?? state.bases.ETH,
          SOL: updates.SOL ?? state.bases.SOL
        }
      }));
    }
  } catch {
    console.warn('[Layout] Failed to bootstrap prices, using defaults');
  }
}

export function startGlobalPriceFeed(): () => void {
  let wsFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let wsFullFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let wsCleanup: (() => void) | null = null;
  let pending: Record<string, number> = {};
  let pendingFull: Record<string, MiniTickerFull> = {};

  void bootstrapInitialPrices();

  try {
    wsCleanup = subscribeMiniTicker(
      [...TRACKED_SYMBOLS],
      (update) => {
        Object.assign(pending, update);
        if (wsFlushTimer) return;

        wsFlushTimer = setTimeout(() => {
          wsFlushTimer = null;
          const batch = pending;
          pending = {};

          const mapped: Record<string, number> = {};
          for (const [symbol, price] of Object.entries(batch)) {
            const key = SYMBOL_MAP[symbol];
            if (key && Number.isFinite(price) && price > 0) mapped[key] = price;
          }
          if (Object.keys(mapped).length) {
            updatePriceStore(mapped, 'ws');
          }
        }, 350);
      },
      (fullUpdate) => {
        for (const [symbol, data] of Object.entries(fullUpdate)) {
          const key = SYMBOL_MAP[symbol];
          if (key && Number.isFinite(data.price) && data.price > 0) {
            pendingFull[key] = data;
          }
        }
        if (wsFullFlushTimer) return;

        wsFullFlushTimer = setTimeout(() => {
          wsFullFlushTimer = null;
          const batch = pendingFull;
          pendingFull = {};

          for (const [key, data] of Object.entries(batch)) {
            updatePriceFull(key, {
              price: data.price,
              ts: Date.now(),
              source: 'ws',
              change24h: data.change24h,
              high24h: data.high24h,
              low24h: data.low24h,
              volume24h: data.volume24h
            });
          }
        }, 5000);
      }
    );
  } catch {
    console.warn('[Layout] Global WS connection failed');
  }

  return () => {
    if (wsFlushTimer) clearTimeout(wsFlushTimer);
    if (wsFullFlushTimer) clearTimeout(wsFullFlushTimer);
    if (wsCleanup) wsCleanup();
  };
}
