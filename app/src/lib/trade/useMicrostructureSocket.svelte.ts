// Binance futures microstructure WebSocket composable.
// Extracted from TradeMode.svelte — manages aggTrade + depth20 streams.

import type { MarketMicrostructurePayload } from '$lib/api/terminalBackend';
import type { MarketDepthLevel, MarketTradePrint } from '$lib/contracts/marketMicrostructure';

type MicroOrderbook = MarketMicrostructurePayload['orderbook'];
type WsState = 'idle' | 'connecting' | 'live' | 'error' | 'closed';

export function toBinanceFuturesStreamSymbol(rawSymbol: string): string {
  const compact = rawSymbol.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!compact) return '';
  return compact.endsWith('usdt') ? compact : `${compact}usdt`;
}

export function toLiveTrade(data: unknown): MarketTradePrint | null {
  const d = data as Record<string, unknown>;
  const price = Number.parseFloat(String(d?.p));
  const qty = Number.parseFloat(String(d?.q));
  const id = Number(d?.a);
  const time = Number(d?.T);
  if (!Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(id) || !Number.isFinite(time)) return null;
  const isBuyerMaker = Boolean(d?.m);
  return { id, time, price, qty, notional: price * qty, side: isBuyerMaker ? 'SELL' : 'BUY', isBuyerMaker };
}

function normalizeDepthLevels(rawLevels: unknown[], maxNotional: number): MarketDepthLevel[] {
  return (rawLevels as unknown[][])
    .slice(0, 20)
    .map((row) => {
      const price = Number.parseFloat(String(row?.[0]));
      const qty = Number.parseFloat(String(row?.[1]));
      return { price, qty, notional: price * qty };
    })
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.qty) && l.price > 0 && l.qty > 0)
    .slice(0, 12)
    .map((l) => ({ ...l, weight: l.notional / Math.max(1, maxNotional) }));
}

export function buildLiveOrderbook(bidsRaw: unknown[], asksRaw: unknown[], current: number | null): MicroOrderbook {
  const parse = (rows: unknown[]) =>
    (rows as unknown[][])
      .slice(0, 20)
      .map((row) => ({ price: Number.parseFloat(String(row?.[0])), qty: Number.parseFloat(String(row?.[1])) }))
      .map((l) => ({ ...l, notional: l.price * l.qty }))
      .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.qty) && l.price > 0 && l.qty > 0);

  const parsedBids = parse(bidsRaw);
  const parsedAsks = parse(asksRaw);
  const maxNotional = Math.max(1, ...parsedBids.map((l) => l.notional), ...parsedAsks.map((l) => l.notional));
  const bids = normalizeDepthLevels(bidsRaw, maxNotional);
  const asks = normalizeDepthLevels(asksRaw, maxNotional);
  const bidNotional = bids.reduce((s, l) => s + l.notional, 0);
  const askNotional = asks.reduce((s, l) => s + l.notional, 0);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const refPrice = current ?? (bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null);

  return {
    bestBid,
    bestAsk,
    spreadBps: bestBid != null && bestAsk != null && refPrice != null && refPrice > 0
      ? ((bestAsk - bestBid) / refPrice) * 10_000
      : null,
    imbalanceRatio: askNotional > 0 ? bidNotional / askNotional : null,
    bidNotional,
    askNotional,
    bids,
    asks,
  };
}

/**
 * Manages aggTrade + depth20@100ms WebSocket for a given futures symbol.
 * Call from a Svelte component — $effect handles lifecycle.
 *
 * @param getSymbol Reactive getter; reconnects when return value changes.
 * @param getRestPrice Fallback mid-price for orderbook construction (e.g. from REST snapshot).
 */
export function useMicrostructureSocket(
  getSymbol: () => string,
  getRestPrice: () => number | null
) {
  let microWsState = $state<WsState>('idle');
  let microWsUpdatedAt = $state<number | null>(null);
  let liveOrderbook = $state<MicroOrderbook | null>(null);
  let liveTrades = $state<MarketTradePrint[]>([]);

  $effect(() => {
    const sym = toBinanceFuturesStreamSymbol(getSymbol());
    if (typeof WebSocket === 'undefined' || !sym) return;

    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      microWsState = 'connecting';
      ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${sym}@aggTrade/${sym}@depth20@100ms`);

      ws.onopen = () => {
        if (!closed) microWsState = 'live';
      };

      ws.onmessage = (event) => {
        if (closed) return;
        try {
          const message = JSON.parse(String(event.data));
          const data = (message?.data ?? message) as Record<string, unknown>;
          if (data?.e === 'aggTrade') {
            const trade = toLiveTrade(data);
            if (!trade) return;
            liveTrades = [trade, ...liveTrades.filter((r) => r.id !== trade.id)].slice(0, 120);
            microWsUpdatedAt = Date.now();
            microWsState = 'live';
          } else if (data?.e === 'depthUpdate' && Array.isArray(data.b) && Array.isArray(data.a)) {
            liveOrderbook = buildLiveOrderbook(
              data.b as unknown[],
              data.a as unknown[],
              liveTrades[0]?.price ?? getRestPrice()
            );
            microWsUpdatedAt = Date.now();
            microWsState = 'live';
          }
        } catch {
          // Keep REST snapshot active; malformed packets must not blank UI.
        }
      };

      ws.onerror = () => {
        if (!closed) microWsState = 'error';
      };

      ws.onclose = () => {
        if (closed) return;
        microWsState = liveTrades.length > 0 || liveOrderbook ? 'closed' : 'error';
        reconnectTimer = window.setTimeout(connect, 3_000);
      };
    };

    liveTrades = [];
    liveOrderbook = null;
    microWsUpdatedAt = null;
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  });

  return {
    get microWsState() { return microWsState; },
    get microWsUpdatedAt() { return microWsUpdatedAt; },
    get liveOrderbook() { return liveOrderbook; },
    get liveTrades() { return liveTrades; },
  };
}
