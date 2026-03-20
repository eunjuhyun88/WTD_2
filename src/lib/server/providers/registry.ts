// ═══════════════════════════════════════════════════════════════
// Stockclaw — Data Provider Registry (B-05)
// ═══════════════════════════════════════════════════════════════
// Unified interface to query all data sources with caching + health tracking

import type { MarketContext } from '$lib/engine/factorEngine';
import type { TrendAnalysis } from '$lib/engine/types';
import type { ProviderHealth, OnchainMetrics, SentimentMetrics } from './types';
import { getCached, setCache } from './cache';
import { fetchKlinesServer, fetch24hrServer, pairToSymbol, type Binance24hr, type BinanceKline } from '$lib/server/binance';
import { fetchDerivatives, fetchNews, normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { fetchFearGreed } from '$lib/server/feargreed';
import { fetchCoinGeckoGlobal, fetchStablecoinMcap } from '$lib/server/coingecko';
import { fetchDefiLlamaStableMcap } from '$lib/server/defillama';
import { fetchYahooSeries } from '$lib/server/yahooFinance';
import { fetchCoinMarketCapQuote } from '$lib/server/coinmarketcap';
import { estimateExchangeNetflow, fetchGasOracle } from '$lib/server/etherscan';
import { fetchWhaleActivity, fetchActiveAddresses, fetchExchangeBalance } from '$lib/server/dune';
import { analyzeTrend } from '$lib/engine/trend';

// ── Health Tracker ──────────────────────────────────────────────

const healthMap = new Map<string, ProviderHealth>();

function trackSuccess(name: string, latencyMs: number): void {
  const h = healthMap.get(name) ?? {
    name,
    available: true,
    lastFetchMs: null,
    errorCount: 0,
    lastError: null,
  };
  h.available = true;
  h.lastFetchMs = latencyMs;
  healthMap.set(name, h);
}

function trackError(name: string, error: unknown): void {
  const h = healthMap.get(name) ?? {
    name,
    available: false,
    lastFetchMs: null,
    errorCount: 0,
    lastError: null,
  };
  h.available = false;
  h.errorCount += 1;
  h.lastError = error instanceof Error ? error.message : String(error);
  healthMap.set(name, h);
}

async function timedFetch<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const start = Date.now();
  try {
    const result = await fn();
    trackSuccess(name, Date.now() - start);
    return result;
  } catch (err) {
    trackError(name, err);
    return null;
  }
}

export function getProviderHealth(): ProviderHealth[] {
  return [...healthMap.values()];
}

// ── Individual Provider Fetchers ────────────────────────────────

async function fetchOnchainMetrics(token: string): Promise<Partial<OnchainMetrics>> {
  const cacheKey = `onchain:${token}`;
  const cached = getCached<Partial<OnchainMetrics>>(cacheKey);
  if (cached) return cached;

  const [exchangeNetflow, whaleActivity, activeAddresses, _exchangeBalance] =
    await Promise.allSettled([
      timedFetch('etherscan', () => estimateExchangeNetflow()),
      timedFetch('dune:whales', () => fetchWhaleActivity()),
      timedFetch('dune:addresses', () => fetchActiveAddresses()),
      timedFetch('dune:exchange_bal', () =>
        fetchExchangeBalance(token === 'BTC' ? 'BTC' : 'ETH'),
      ),
    ]);

  const metrics: Partial<OnchainMetrics> = {
    exchangeNetflow:
      exchangeNetflow.status === 'fulfilled' ? exchangeNetflow.value : null,
    whaleActivity:
      whaleActivity.status === 'fulfilled' ? whaleActivity.value : null,
    activeAddresses:
      activeAddresses.status === 'fulfilled' ? activeAddresses.value : null,
  };

  setCache(cacheKey, metrics, 120_000);
  return metrics;
}

async function fetchSentimentMetrics(): Promise<Partial<SentimentMetrics>> {
  const cacheKey = 'sentiment:all';
  const cached = getCached<Partial<SentimentMetrics>>(cacheKey);
  if (cached) return cached;

  const [fearGreedRes, newsRes] = await Promise.allSettled([
    timedFetch('feargreed', () => fetchFearGreed(60)),
    timedFetch('news', () => fetchNews(20)),
  ]);

  const fearGreed = fearGreedRes.status === 'fulfilled' ? fearGreedRes.value : null;
  const news = newsRes.status === 'fulfilled' ? newsRes.value : [];

  let newsImpact: number | null = null;
  if (Array.isArray(news) && news.length > 0) {
    let bull = 0;
    let bear = 0;
    for (const item of news) {
      if (item.sentiment === 'bullish') bull++;
      if (item.sentiment === 'bearish') bear++;
    }
    if (bull + bear > 0) newsImpact = Math.round(((bull - bear) / (bull + bear)) * 70);
  }

  const metrics: Partial<SentimentMetrics> = {
    fearGreed: fearGreed?.current?.value ?? null,
    newsImpact,
  };

  setCache(cacheKey, metrics, 120_000);
  return metrics;
}

function buildTrend(points: Array<{ close: number }> | null): TrendAnalysis | null {
  if (!points?.length) return null;
  return analyzeTrend(points.map((p) => p.close));
}

// ── Main: Assemble Full MarketContext ────────────────────────────

export async function assembleMarketContext(
  eventFetch: typeof fetch,
  input: { pair?: unknown; timeframe?: unknown },
): Promise<{
  context: MarketContext;
  health: ProviderHealth[];
  sourcesOk: Record<string, boolean>;
}> {
  const pair = normalizePair(input.pair);
  const timeframe = normalizeTimeframe(input.timeframe);
  const symbol = pairToSymbol(pair);
  const token = pair.split('/')[0];

  // ── Parallel fetch all sources ──
  const [
    klinesRes,
    klines1hRes,
    klines1dRes,
    tickerRes,
    derivRes,
    sentimentRes,
    onchainRes,
    geckoGlobalRes,
    geckoStableRes,
    llamaStableRes,
    dxyRes,
    spxRes,
    us10yRes,
    cmcRes,
  ] = await Promise.allSettled([
    timedFetch('binance:klines', () => fetchKlinesServer(symbol, timeframe, 300)),
    timedFetch('binance:klines1h', () => fetchKlinesServer(symbol, '1h', 300)),
    timedFetch('binance:klines1d', () => fetchKlinesServer(symbol, '1d', 300)),
    timedFetch('binance:ticker', () => fetch24hrServer(symbol)),
    timedFetch('coinalyze', () => fetchDerivatives(eventFetch, pair, timeframe)),
    fetchSentimentMetrics(),
    fetchOnchainMetrics(token),
    timedFetch('coingecko:global', () => fetchCoinGeckoGlobal()),
    timedFetch('coingecko:stable', () => fetchStablecoinMcap()),
    timedFetch('defillama:stable', () => fetchDefiLlamaStableMcap()),
    timedFetch('yahoo:dxy', () => fetchYahooSeries('DX-Y.NYB', '1mo', '1d')),
    timedFetch('yahoo:spx', () => fetchYahooSeries('^GSPC', '1mo', '1d')),
    timedFetch('yahoo:us10y', () => fetchYahooSeries('^TNX', '1mo', '1d')),
    timedFetch('coinmarketcap', () => fetchCoinMarketCapQuote(token)),
  ]);

  const ok = <T>(r: PromiseSettledResult<T>): T | null =>
    r.status === 'fulfilled' ? r.value : null;

  const klines = ok(klinesRes) ?? [];
  if (klines.length === 0) throw new Error('binance klines unavailable');

  const ticker = ok(tickerRes) as Binance24hr | null;
  const derivatives = ok(derivRes);
  const sentiment = (ok(sentimentRes) as Partial<SentimentMetrics> | null) ?? {};
  const onchain = (ok(onchainRes) as Partial<OnchainMetrics> | null) ?? {};
  const geckoGlobal = ok(geckoGlobalRes) as Record<string, unknown> | null;
  const geckoStable = ok(geckoStableRes) as Record<string, unknown> | null;
  const llamaStable = ok(llamaStableRes) as Record<string, unknown> | null;
  const dxy = ok(dxyRes) as { points?: Array<{ close: number }> } | null;
  const spx = ok(spxRes) as { points?: Array<{ close: number }> } | null;
  const us10y = ok(us10yRes) as { points?: Array<{ close: number }> } | null;
  const cmc = ok(cmcRes) as { marketCap?: number } | null;

  const stableMcap =
    (llamaStable?.totalMcapUsd as number | undefined) ??
    (geckoStable?.totalMcapUsd as number | undefined) ??
    null;
  const stableMcapChange =
    (llamaStable?.change24hPct as number | undefined) ??
    (geckoStable?.change24hPct as number | undefined) ??
    null;

  const context: MarketContext = {
    pair,
    timeframe,
    klines: klines as BinanceKline[],
    klines1h: (ok(klines1hRes) as BinanceKline[] | null) ?? undefined,
    klines1d: (ok(klines1dRes) as BinanceKline[] | null) ?? undefined,
    ticker: ticker
      ? {
          change24h: Number(ticker.priceChangePercent ?? 0),
          volume24h: Number(ticker.quoteVolume ?? 0),
          high24h: Number(ticker.highPrice ?? 0),
          low24h: Number(ticker.lowPrice ?? 0),
        }
      : undefined,
    derivatives: derivatives
      ? {
          oi: (derivatives as Record<string, unknown>).oi as number | null | undefined,
          funding: (derivatives as Record<string, unknown>).funding as number | null | undefined,
          predFunding: (derivatives as Record<string, unknown>).predFunding as number | null | undefined,
          lsRatio: (derivatives as Record<string, unknown>).lsRatio as number | null | undefined,
          liqLong: (derivatives as Record<string, unknown>).liqLong24h as number | undefined,
          liqShort: (derivatives as Record<string, unknown>).liqShort24h as number | undefined,
        }
      : undefined,
    onchain: {
      ...onchain,
      stablecoinFlow: stableMcapChange,
      realizedCap: cmc?.marketCap ?? null,
    },
    sentiment: {
      ...sentiment,
    },
    macro: {
      dxy: dxy?.points?.length ? dxy.points[dxy.points.length - 1].close : null,
      dxyTrend: buildTrend(dxy?.points ?? null),
      equityTrend: buildTrend(spx?.points ?? null),
      yieldTrend: buildTrend(us10y?.points ?? null),
      btcDominance: (geckoGlobal?.btcDominance as number | undefined) ?? null,
      btcDomTrend:
        geckoGlobal?.btcDominance != null
          ? analyzeTrend([geckoGlobal.btcDominance as number])
          : null,
      stablecoinMcap: stableMcap,
      stableMcapTrend:
        stableMcap != null && stableMcapChange != null
          ? analyzeTrend([stableMcap / (1 + stableMcapChange / 100), stableMcap])
          : null,
      eventProximity: 0,
    },
  };

  return {
    context,
    health: getProviderHealth(),
    sourcesOk: {
      binance: klines.length > 0,
      coinalyze: Boolean(derivatives),
      feargreed: sentiment.fearGreed != null,
      coingecko: Boolean(geckoGlobal),
      defillama: Boolean(llamaStable),
      yahoo: Boolean(dxy || spx || us10y),
      coinmarketcap: Boolean(cmc),
      etherscan: onchain.exchangeNetflow != null,
      dune: onchain.whaleActivity != null || onchain.activeAddresses != null,
      news: sentiment.newsImpact != null,
    },
  };
}
