// ═══════════════════════════════════════════════════════════════
// Market Data Service — fetch primitives for the raw source adapter
// ═══════════════════════════════════════════════════════════════
//
// This module exposes pure fetchers for the non-kline, non-ticker
// Binance fapi endpoints (depth, OI history, taker ratio, long/short,
// force orders) plus a handful of non-Binance upstreams (mempool,
// blockchain.info, upbit, bithumb, coingecko). Every consumer now
// reaches these via `readRaw()` in `providers/rawSources.ts`, which
// wraps the Binance-hitting calls with the provider-level
// `binanceQuota` limiter.
//
// The previous client-side `RateLimiter` class + `rateLimiter`
// singleton lived here so `scanner.ts` and `toolExecutor.ts` could
// wrap direct fetches with `rateLimiter.execute(...)`. Dissection §1.1
// mandates DROP for that pattern; the replacement is owned by
// `providers/binanceQuota.ts` and is invisible to callers.

const FAPI = 'https://fapi.binance.com';
const SPOT = 'https://api.binance.com';

// ─── Types ─────────────────────────────────────────────

export interface OrderBookSnapshot {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  bidVolume: number;
  askVolume: number;
  ratio: number;
}

export interface OIHistoryPoint {
  timestamp: number;
  sumOpenInterest: number;
  sumOpenInterestValue: number;
}

export interface TakerRatioPoint {
  timestamp: number;
  buySellRatio: number;
  buyVol: number;
  sellVol: number;
}

export interface GlobalLSPoint {
  timestamp: number;
  longShortRatio: number;
  longAccount: number;
  shortAccount: number;
}

export interface ForceOrder {
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  origQty: number;
  time: number;
}

export interface BtcOnchain {
  nTx: number;
  totalBtcSent: number;
  avgTxValue: number;
}

export interface MempoolData {
  count: number;
  vsize: number;
  totalFee: number;
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
}

// ─── Fetch Functions ───────────────────────────────────

/** Order book depth (L4) */
export async function fetchDepth(symbol: string, limit = 20): Promise<OrderBookSnapshot> {
  const res = await fetch(`${FAPI}/fapi/v1/depth?symbol=${symbol}&limit=${limit}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`depth ${res.status}`);
  const data = await res.json();

  const bids = data.bids.slice(0, limit).map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])] as [number, number]);
  const asks = data.asks.slice(0, limit).map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])] as [number, number]);

  const bidVolume = bids.reduce((sum: number, [p, q]: [number, number]) => sum + p * q, 0);
  const askVolume = asks.reduce((sum: number, [p, q]: [number, number]) => sum + p * q, 0);

  return { bids, asks, bidVolume, askVolume, ratio: askVolume > 0 ? bidVolume / askVolume : 1 };
}

/** OI History (L2 enhancement) */
export async function fetchOIHistory(symbol: string, period = '1h', limit = 6): Promise<OIHistoryPoint[]> {
  const res = await fetch(
    `${FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`oiHist ${res.status}`);
  const data = await res.json();
  return data.map((d: any) => ({
    timestamp: d.timestamp,
    sumOpenInterest: parseFloat(d.sumOpenInterest),
    sumOpenInterestValue: parseFloat(d.sumOpenInterestValue),
  }));
}

/** Taker Buy/Sell Ratio (L2 enhancement) */
export async function fetchTakerRatio(symbol: string, period = '1h', limit = 6): Promise<TakerRatioPoint[]> {
  const res = await fetch(
    `${FAPI}/futures/data/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=${limit}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`taker ${res.status}`);
  const data = await res.json();
  return data.map((d: any) => ({
    timestamp: d.timestamp,
    buySellRatio: parseFloat(d.buySellRatio),
    buyVol: parseFloat(d.buyVol),
    sellVol: parseFloat(d.sellVol),
  }));
}

/** Global Long/Short Account Ratio */
export async function fetchGlobalLS(symbol: string, period = '1h', limit = 4): Promise<GlobalLSPoint[]> {
  const res = await fetch(
    `${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=${limit}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`globalLS ${res.status}`);
  const data = await res.json();
  return data.map((d: any) => ({
    timestamp: d.timestamp,
    longShortRatio: parseFloat(d.longShortRatio),
    longAccount: parseFloat(d.longAccount),
    shortAccount: parseFloat(d.shortAccount),
  }));
}

/** Real liquidations -- forceOrders (L9) */
export async function fetchForceOrders(symbol: string, limit = 50): Promise<ForceOrder[]> {
  const res = await fetch(
    `${FAPI}/fapi/v1/forceOrders?symbol=${symbol}&limit=${limit}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`forceOrders ${res.status}`);
  const data = await res.json();
  return data.map((o: any) => ({
    symbol: o.symbol,
    side: o.side,
    price: parseFloat(o.price),
    origQty: parseFloat(o.origQty),
    time: o.time,
  }));
}

/** BTC on-chain from blockchain.info (L6) */
export async function fetchBtcOnchain(): Promise<BtcOnchain> {
  const res = await fetch('https://api.blockchain.info/stats', {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`btcOnchain ${res.status}`);
  const data = await res.json();
  const nTx = data.n_tx || 0;
  const totalBtcSent = (data.total_btc_sent || 0) / 1e8;
  return { nTx, totalBtcSent, avgTxValue: nTx > 0 ? totalBtcSent / nTx : 0 };
}

/** Mempool data (L6) */
export async function fetchMempool(): Promise<MempoolData> {
  const [mempoolRes, feeRes] = await Promise.all([
    fetch('https://mempool.space/api/mempool', { signal: AbortSignal.timeout(5000) }),
    fetch('https://mempool.space/api/v1/fees/recommended', { signal: AbortSignal.timeout(5000) }),
  ]);

  const mp = mempoolRes.ok ? await mempoolRes.json() : { count: 0, vsize: 0, total_fee: 0 };
  const fees = feeRes.ok ? await feeRes.json() : { fastestFee: 0, halfHourFee: 0, hourFee: 0 };

  return {
    count: mp.count || 0,
    vsize: mp.vsize || 0,
    totalFee: mp.total_fee || 0,
    fastestFee: fees.fastestFee || 0,
    halfHourFee: fees.halfHourFee || 0,
    hourFee: fees.hourFee || 0,
  };
}

/** Upbit KRW prices for kimchi premium (L8) */
export async function fetchUpbitPrices(): Promise<Map<string, number>> {
  const marketsRes = await fetch('https://api.upbit.com/v1/market/all?isDetails=false', {
    signal: AbortSignal.timeout(5000),
  });
  if (!marketsRes.ok) return new Map();
  const markets = await marketsRes.json();
  const krwMarkets = markets.filter((m: any) => m.market.startsWith('KRW-')).map((m: any) => m.market);

  const tickerRes = await fetch(`https://api.upbit.com/v1/ticker?markets=${krwMarkets.join(',')}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!tickerRes.ok) return new Map();
  const tickers = await tickerRes.json();

  const map = new Map<string, number>();
  for (const t of tickers) {
    const base = t.market.replace('KRW-', '');
    map.set(base, t.trade_price);
  }
  return map;
}

/** Bithumb KRW prices for kimchi premium cross-check (L8) */
export async function fetchBithumbPrices(): Promise<Map<string, number>> {
  const res = await fetch('https://api.bithumb.com/public/ticker/ALL_KRW', {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return new Map();
  const data = await res.json();

  const map = new Map<string, number>();
  if (data.data) {
    for (const [key, val] of Object.entries(data.data)) {
      if (key === 'date') continue;
      map.set(key, parseFloat((val as any).closing_price) || 0);
    }
  }
  return map;
}

/** USD/KRW exchange rate */
export async function fetchUsdKrw(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 1350;
    const data = await res.json();
    return data?.tether?.krw || 1350;
  } catch {
    return 1350;
  }
}

/** BTC dominance from CoinGecko */
export async function fetchBtcDominance(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data?.data?.market_cap_percentage?.btc || 0;
  } catch {
    return 0;
  }
}
