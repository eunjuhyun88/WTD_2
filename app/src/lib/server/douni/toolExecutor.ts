// ═══════════════════════════════════════════════════════════════
// DOUNI — Tool Executor
// ═══════════════════════════════════════════════════════════════
//
// LLM의 tool_call을 실제 실행하고 결과를 반환.
// 각 도구는 기존 서비스를 호출하여 결과를 생성.

import type { ToolCall, ToolResult, ToolExecutorContext, DouniSSEEvent } from './types';
import type { SignalSnapshot, ExtendedMarketData } from '$lib/engine/cogochi/types';
import { VALID_TOOL_NAMES } from './tools';
import { computeSignalSnapshot, computeIndicatorSeries } from '$lib/engine/cogochi/layerEngine';
import { detectSupportResistance } from '$lib/engine/cogochi/supportResistance';
import { signSnapshot } from '$lib/engine/cogochi/hmac';
import type { MarketContext } from '$lib/engine/factorEngine';
import { scanMarket, type ScanConfig } from '$lib/server/scanner';
import { readRaw, klinesRawIdForTimeframe } from '../providers';
import { KnownRawId } from '$lib/contracts/ids';
import { buildResearchBlocks } from '$lib/server/researchView/buildResearchBlocks';
function toFiniteNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeForceOrderSide(side: string): 'BUY' | 'SELL' {
  return side.toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
}
// ─── Main Dispatcher ────────────────────────────────────────

/**
 * Execute a tool call and return the result.
 * Also returns SSE events to emit to the client.
 */
export async function executeTool(
  toolCall: ToolCall,
  ctx: ToolExecutorContext,
): Promise<{ result: ToolResult; events: DouniSSEEvent[] }> {
  const { name } = toolCall.function;
  const events: DouniSSEEvent[] = [];

  if (!VALID_TOOL_NAMES.has(name)) {
    const result: ToolResult = {
      toolCallId: toolCall.id,
      name,
      result: null,
      error: `Unknown tool: ${name}`,
    };
    events.push({ type: 'error', message: `Unknown tool: ${name}` });
    return { result, events };
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    const result: ToolResult = {
      toolCallId: toolCall.id,
      name,
      result: null,
      error: 'Invalid JSON arguments',
    };
    events.push({ type: 'error', message: 'Tool call: invalid arguments' });
    return { result, events };
  }

  // Emit tool_call event to client
  events.push({ type: 'tool_call', name, args });

  try {
    let data: unknown;

    switch (name) {
      case 'analyze_market':
        data = await executeAnalyzeMarket(args, ctx, events);
        break;
      case 'check_social':
        data = await executeCheckSocial(args, events);
        break;
      case 'scan_market':
        data = await executeScanMarket(args, events);
        break;
      case 'chart_control':
        data = executeChartControl(args, events);
        break;
      case 'save_pattern':
        data = executeSavePattern(args, events);
        break;
      case 'submit_feedback':
        data = executeSubmitFeedback(args, events);
        break;
      case 'query_memory':
        data = executeQueryMemory(args, events);
        break;
      default:
        data = null;
    }

    events.push({ type: 'tool_result', name, data });

    return {
      result: {
        toolCallId: toolCall.id,
        name,
        result: data,
      },
      events,
    };
  } catch (err: any) {
    events.push({ type: 'error', message: `Tool ${name} failed: ${err.message}` });
    return {
      result: {
        toolCallId: toolCall.id,
        name,
        result: null,
        error: err.message,
      },
      events,
    };
  }
}

// ─── analyze_market ─────────────────────────────────────────

async function executeAnalyzeMarket(
  args: Record<string, unknown>,
  ctx: ToolExecutorContext,
  events: DouniSSEEvent[],
): Promise<Record<string, unknown>> {
  const symbol = (args.symbol as string || ctx.symbol || 'BTCUSDT').toUpperCase();
  const tf = (args.timeframe as string) || ctx.timeframe || '4h';
  const isBTC = symbol.startsWith('BTC');
  const traceId = `terminal-${symbol}-${tf}-${Date.now()}`;
  const pair = `${symbol.replace('USDT', '')}/USDT`;

  // Fetch all data in parallel. Every Binance-hitting raw flows through
  // `binanceQuota` inside `rawSources`, so callers no longer need a
  // per-site rate limiter wrapper. Timeframe for the "current" klines
  // set is resolved dynamically from the user-supplied `tf`; we fall
  // back to the 4h bucket when the runtime timeframe is not one of the
  // supported klines atoms.
  const currentKlinesRaw = klinesRawIdForTimeframe(tf);
  const [
    klines, klines1h, klines1d, klines5m, ticker,
    funding, oiPoint, lsTop, fearGreed, depth, oiHistory, takerData,
    forceOrders, btcOnchainData, mempoolData,
    upbitPrices, bithumbPrices, usdKrw,
    coinalyzeOiHistory, fundingHistory, lsRatioHistory, liquidationHistory,
  ] = await Promise.all([
    readRaw(currentKlinesRaw, { symbol, limit: 200 }),
    readRaw(KnownRawId.KLINES_1H, { symbol, limit: 100 }).catch(() => []),
    readRaw(KnownRawId.KLINES_1D, { symbol, limit: 50 }).catch(() => []),
    readRaw(KnownRawId.KLINES_5M, { symbol, limit: 60 }).catch(() => []),
    readRaw(KnownRawId.TICKER_24HR, { symbol }).catch(() => null),
    readRaw(KnownRawId.FUNDING_RATE, { symbol }).catch(() => null),
    readRaw(KnownRawId.OPEN_INTEREST_POINT, { symbol }).catch(() => null),
    readRaw(KnownRawId.LONG_SHORT_TOP_1H, { symbol }).catch(() => null),
    readRaw(KnownRawId.FEAR_GREED_VALUE, {}).catch(() => null),
    readRaw(KnownRawId.DEPTH_L2_20, { symbol }).catch(() => null),
    readRaw(KnownRawId.OI_HIST_5M, { symbol }).catch(() => []),
    readRaw(KnownRawId.TAKER_BUY_SELL_RATIO, { symbol }).catch(() => []),
    readRaw(KnownRawId.FORCE_ORDERS_1H, { symbol }).catch(() => []),
    // BTC onchain + mempool: rawSources already dedupes compound fetches,
    // so reading one slice pulls the whole payload once and caches it.
    isBTC
      ? Promise.all([
          readRaw(KnownRawId.BTC_N_TX_24H, {}).catch(() => null),
          readRaw(KnownRawId.BTC_AVG_TX_VALUE, {}).catch(() => null),
        ]).then(([nTx, avgTxValue]) =>
          nTx != null && avgTxValue != null ? { nTx, avgTxValue } : null,
        )
      : Promise.resolve(null),
    isBTC
      ? Promise.all([
          readRaw(KnownRawId.MEMPOOL_PENDING_TX, {}).catch(() => null),
          readRaw(KnownRawId.MEMPOOL_FASTEST_FEE, {}).catch(() => null),
        ]).then(([pending, fastestFee]) =>
          pending != null && fastestFee != null ? { count: pending, fastestFee } : null,
        )
      : Promise.resolve(null),
    readRaw(KnownRawId.UPBIT_PRICE_MAP, {}).catch(() => new Map()),
    readRaw(KnownRawId.BITHUMB_PRICE_MAP, {}).catch(() => new Map()),
    readRaw(KnownRawId.USD_KRW_RATE, {}).catch(() => 1350),
    // B13-b: Coinalyze cross-exchange history now flows through
    // `readRaw()` under dedicated `COINALYZE_*` atoms. This gives
    // buildResearchBlocks.ts a provenance-honest sourceId chain to cite
    // (see metric_strip block below — the four history rows previously
    // cited Binance-family atoms but rendered Coinalyze data, and the
    // research view contract enforces sourceId↔data fidelity).
    readRaw(KnownRawId.COINALYZE_OI_HIST_TF, { pair, tf, limit: 60 }).catch(() => []),
    readRaw(KnownRawId.COINALYZE_FUNDING_HIST_TF, { pair, tf, limit: 60 }).catch(() => []),
    readRaw(KnownRawId.COINALYZE_LSRATIO_HIST_TF, { pair, tf, limit: 60 }).catch(() => []),
    readRaw(KnownRawId.COINALYZE_LIQ_HIST_TF, { pair, tf, limit: 60 }).catch(() => []),
  ]);

  if (!klines.length) {
    throw new Error(`No kline data for ${symbol}`);
  }

  const currentPrice = klines[klines.length - 1].close;

  // Build MarketContext (base)
  const marketCtx: MarketContext = {
    pair: symbol,
    timeframe: tf,
    klines,
    klines1h: klines1h.length > 0 ? klines1h : undefined,
    klines1d: klines1d.length > 0 ? klines1d : undefined,
    ticker: ticker ? {
      change24h: parseFloat(ticker.priceChangePercent) || 0,
      volume24h: parseFloat(ticker.quoteVolume) || 0,
      high24h: parseFloat(ticker.highPrice) || 0,
      low24h: parseFloat(ticker.lowPrice) || 0,
    } : undefined,
    derivatives: {
      oi: oiPoint,
      funding,
      lsRatio: lsTop,
    },
    sentiment: { fearGreed },
  };

  // Compute OI change %
  let oiChangePct = 0;
  if (oiHistory.length >= 2) {
    const firstOI = oiHistory[0].sumOpenInterestValue;
    const lastOI = oiHistory[oiHistory.length - 1].sumOpenInterestValue;
    oiChangePct = firstOI > 0 ? ((lastOI - firstOI) / firstOI) * 100 : 0;
  }

  // Compute kimchi premium
  let kimchiPremium = 0;
  const baseSymbol = symbol.replace('USDT', '');
  const binanceKrw = currentPrice * usdKrw;
  const prems: number[] = [];
  const upbitPrice = upbitPrices.get(baseSymbol);
  const bithumbPrice = bithumbPrices.get(baseSymbol);
  if (upbitPrice && binanceKrw > 0) prems.push(((upbitPrice / binanceKrw) - 1) * 100);
  if (bithumbPrice && binanceKrw > 0) prems.push(((bithumbPrice / binanceKrw) - 1) * 100);
  if (prems.length > 0) kimchiPremium = prems.reduce((s, v) => s + v, 0) / prems.length;

  // Build ExtendedMarketData
  const ext: ExtendedMarketData = {
    currentPrice,
    depth: depth ? { bidVolume: depth.bidVolume, askVolume: depth.askVolume, ratio: depth.ratio } : undefined,
    // takerData is now the fixed 1h×6 window (§10 Q1). The latest point
    // is the last element; previously this read [0] because limit=1.
    takerRatio: takerData.length > 0 ? takerData[takerData.length - 1].buySellRatio : undefined,
    oiChangePct,
    priceChangePct: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
    forceOrders: forceOrders.map((o: { side: string; price: number | string; origQty: number | string; time: number }) => ({
      side: normalizeForceOrderSide(o.side),
      price: toFiniteNumber(o.price),
      qty: toFiniteNumber(o.origQty),
      time: o.time,
    })),
    btcOnchain: btcOnchainData ? { nTx: btcOnchainData.nTx, avgTxValue: btcOnchainData.avgTxValue } : undefined,
    mempool: mempoolData ? { pending: mempoolData.count, fastestFee: mempoolData.fastestFee } : undefined,
    kimchiPremium,
    klines5m: klines5m.length > 0 ? klines5m.map((k: any) => ({
      time: k.time, open: k.open, high: k.high, low: k.low, close: k.close,
      volume: k.volume, buyVolume: k.takerBuyBaseVol,
    })) : undefined,
    klines1dExt: klines1d.length > 0 ? klines1d.map((k: any) => ({
      time: k.time, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume,
    })) : undefined,
    oiHistory5m: oiHistory.length > 0 ? oiHistory.map((p: any) => ({
      timestamp: p.timestamp, oi: p.sumOpenInterestValue,
    })) : undefined,
  };

  // Compute snapshot with extended data
  const snapshot = computeSignalSnapshot(marketCtx, symbol, tf, ext);
  snapshot.hmac = signSnapshot(snapshot);

  // Cache
  ctx.cachedSnapshot = snapshot;
  ctx.symbol = symbol;
  ctx.timeframe = tf;

  // Emit layer results for UI
  const layerEntries: Array<{ layer: string; score: number; signal: string; detail?: string }> = [
    { layer: 'L1', score: snapshot.l1.score, signal: snapshot.l1.phase, detail: snapshot.l1.pattern },
    { layer: 'L2', score: snapshot.l2.score, signal: `FR:${(snapshot.l2.fr * 100).toFixed(3)}%`, detail: snapshot.l2.detail },
    { layer: 'L3', score: snapshot.l3.score, signal: snapshot.l3.label },
    { layer: 'L4', score: snapshot.l4.score, signal: snapshot.l4.label },
    { layer: 'L5', score: snapshot.l5.score, signal: snapshot.l5.label },
    { layer: 'L6', score: snapshot.l6.score, signal: snapshot.l6.detail },
    { layer: 'L7', score: snapshot.l7.score, signal: snapshot.l7.label },
    { layer: 'L8', score: snapshot.l8.score, signal: snapshot.l8.label },
    { layer: 'L9', score: snapshot.l9.score, signal: snapshot.l9.label },
    { layer: 'L10', score: snapshot.l10.score, signal: snapshot.l10.label },
    { layer: 'L11', score: snapshot.l11.score, signal: snapshot.l11.cvd_state },
    { layer: 'L13', score: snapshot.l13.score, signal: snapshot.l13.label },
    { layer: 'L14', score: snapshot.l14.score, signal: snapshot.l14.label },
    { layer: 'L18', score: snapshot.l18.score, signal: snapshot.l18.label },
    { layer: 'L19', score: snapshot.l19.score, signal: snapshot.l19.label },
  ];

  for (const entry of layerEntries) {
    events.push({ type: 'layer_result', ...entry });
  }

  // Chart klines
  const chartKlines = klines.slice(-100).map((k: any) => ({
    t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
  }));

  // S/R + indicators
  const annotations = detectSupportResistance(klines, currentPrice);
  const indicatorSeries = computeIndicatorSeries(klines);
  const asOf = new Date().toISOString();
  const researchBlocks = buildResearchBlocks({
    traceId,
    symbol,
    timeframe: tf as '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    asOf,
    priceSeries: chartKlines,
    annotations,
    klines5m: ext.klines5m,
    oiHistory: coinalyzeOiHistory,
    fundingHistory,
    lsRatioHistory,
    liquidationHistory,
    depthSnapshot: depth,
    forceOrders: ext.forceOrders?.map((order) => ({
      symbol,
      side: order.side,
      price: order.price,
      origQty: order.qty,
      time: order.time,
    })),
    takerData,
    currentFunding: funding,
    currentLsRatio: lsTop,
    currentOi: oiPoint
  });

  for (const researchBlock of researchBlocks) {
    events.push({ type: 'research_block', payload: researchBlock });
  }

  return {
    traceId,
    symbol,
    timeframe: tf,
    asOf,
    alphaScore: snapshot.alphaScore,
    alphaLabel: snapshot.alphaLabel,
    verdict: snapshot.verdict,
    regime: snapshot.regime,
    extremeFR: snapshot.extremeFR,
    frAlert: snapshot.frAlert,
    mtfTriple: snapshot.mtfTriple,
    bbBigSqueeze: snapshot.bbBigSqueeze,
    l1: snapshot.l1,
    l2: snapshot.l2,
    l3: snapshot.l3,
    l4: snapshot.l4,
    l5: snapshot.l5,
    l6: snapshot.l6,
    l7: snapshot.l7,
    l8: snapshot.l8,
    l9: snapshot.l9,
    l10: snapshot.l10,
    l11: snapshot.l11,
    l12: snapshot.l12,
    l13: snapshot.l13,
    l14: snapshot.l14,
    l15: snapshot.l15,
    l18: snapshot.l18,
    l19: snapshot.l19,
    price: currentPrice,
    change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
    chart: chartKlines,
    derivatives: {
      funding,
      oi: oiPoint,
      lsRatio: lsTop,
    },
    annotations,
    indicators: {
      bbUpper: indicatorSeries.bbUpper?.slice(-100),
      bbMiddle: indicatorSeries.bbMiddle?.slice(-100),
      bbLower: indicatorSeries.bbLower?.slice(-100),
      ema20: indicatorSeries.ema20?.slice(-100),
    },
    researchBlocks,
  };
}

// ─── check_social ───────────────────────────────────────────

// Symbol mapping for CoinGecko API
const COIN_ID_MAP: Record<string, string> = {
  bitcoin: 'bitcoin', btc: 'bitcoin',
  ethereum: 'ethereum', eth: 'ethereum',
  solana: 'solana', sol: 'solana',
  dogecoin: 'dogecoin', doge: 'dogecoin',
  xrp: 'ripple', ripple: 'ripple',
  cardano: 'cardano', ada: 'cardano',
  avalanche: 'avalanche-2', avax: 'avalanche-2',
  polkadot: 'polkadot', dot: 'polkadot',
  chainlink: 'chainlink', link: 'chainlink',
  bnb: 'binancecoin', sui: 'sui', pepe: 'pepe',
};

async function executeCheckSocial(
  args: Record<string, unknown>,
  events: DouniSSEEvent[],
): Promise<Record<string, unknown>> {
  const rawTopic = (args.topic as string || 'bitcoin').toLowerCase().replace('$', '');
  const coinId = COIN_ID_MAP[rawTopic] || rawTopic;

  const timeout = AbortSignal.timeout(8000);

  // Fetch from CoinGecko (free, no API key)
  const [coinRes, trendRes, fgRes] = await Promise.all([
    fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=true&developer_data=false&sparkline=false`,
      { signal: timeout },
    ).catch(() => null),
    fetch('https://api.coingecko.com/api/v3/search/trending', { signal: timeout }).catch(() => null),
    readRaw(KnownRawId.FEAR_GREED_VALUE, {}).catch(() => null),
  ]);

  const coinData = coinRes?.ok ? await coinRes.json().catch(() => null) : null;
  const trendData = trendRes?.ok ? await trendRes.json().catch(() => null) : null;

  if (!coinData) {
    return {
      topic: rawTopic,
      source: 'unavailable',
      note: `Could not find data for "${rawTopic}". Try using standard name (bitcoin, ethereum, solana...).`,
    };
  }

  const cd = coinData.community_data || {};
  const md = coinData.market_data || {};

  // Derive a pseudo-sentiment from price change + community data
  const change24h = md.price_change_percentage_24h || 0;
  const change7d = md.price_change_percentage_7d || 0;
  const pseudoSentiment = Math.round(50 + (change24h * 2) + (change7d * 0.5));
  const clampedSentiment = Math.max(0, Math.min(100, pseudoSentiment));

  // Check if trending
  const trendingCoins = (trendData?.coins || []).map((c: any) => c.item?.id);
  const isTrending = trendingCoins.includes(coinId);
  const trendRank = trendingCoins.indexOf(coinId) + 1;

  // Community metrics
  const twitterFollowers = cd.twitter_followers || 0;
  const redditSubscribers = cd.reddit_subscribers || 0;
  const redditActiveAccounts = cd.reddit_accounts_active_48h || 0;

  // Emit social event for UI
  events.push({
    type: 'social_data',
    topic: rawTopic,
    sentiment: clampedSentiment,
    trending: isTrending,
  });

  return {
    topic: rawTopic,
    source: 'coingecko',
    name: coinData.name,
    symbol: (coinData.symbol || '').toUpperCase(),
    sentiment_score: clampedSentiment,
    sentiment_label: clampedSentiment > 60 ? 'Bullish' : clampedSentiment < 40 ? 'Bearish' : 'Neutral',
    fear_greed: fgRes,
    is_trending: isTrending,
    trend_rank: isTrending ? trendRank : null,
    price: md.current_price?.usd || null,
    change_24h: change24h,
    change_7d: change7d,
    market_cap: md.market_cap?.usd || null,
    market_cap_rank: coinData.market_cap_rank || null,
    community: {
      twitter_followers: twitterFollowers,
      reddit_subscribers: redditSubscribers,
      reddit_active_48h: redditActiveAccounts,
    },
    coingecko_score: coinData.coingecko_score || null,
    developer_score: coinData.developer_score || null,
    community_score: coinData.community_score || null,
    liquidity_score: coinData.liquidity_score || null,
  };
}

// ─── scan_market (17-layer Binance engine) ──────────────────

async function executeScanMarket(
  args: Record<string, unknown>,
  events: DouniSSEEvent[],
): Promise<Record<string, unknown>> {
  const sort = (args.sort as string) || 'alphaScore';
  const sector = args.sector as string | undefined;
  const rawSymbols = args.symbols as string[] | undefined;
  const limit = Math.min((args.limit as number) || 10, 10); // 터미널용 최대 10

  // Build scan config
  const config: ScanConfig = rawSymbols?.length
    ? { mode: 'custom', symbols: rawSymbols.map(s => s.toUpperCase().replace('USDT', '') + 'USDT') }
    : { mode: 'topN', topN: limit, preset: sector || undefined };

  const results = await scanMarket(config);

  // Sort by alphaScore descending
  results.sort((a, b) => Math.abs(b.alphaScore) - Math.abs(a.alphaScore));

  const coins = results.slice(0, limit).map((r, i) => ({
    rank: i + 1,
    symbol: r.symbol.replace('USDT', ''),
    name: r.symbol.replace('USDT', ''),
    price: r.price,
    change24h: r.change24h,
    alphaScore: r.alphaScore,
    alphaLabel: r.alphaLabel,
    verdict: r.verdict,
    regime: r.regime,
    flags: [
      r.hasWyckoff ? 'wyckoff' : null,
      r.hasMTF ? 'mtf_triple' : null,
      r.hasSqueeze ? 'bb_squeeze' : null,
      r.hasLiqAlert ? 'liq_alert' : null,
      r.extremeFR ? 'fr_extreme' : null,
    ].filter(Boolean),
    volume_24h: r.volume24h,
  }));

  events.push({ type: 'scan_result', sort, count: coins.length });

  return {
    source: 'binance_17layer',
    sort,
    sector: sector || 'all',
    coins,
  };
}

// ─── chart_control ──────────────────────────────────────────

function executeChartControl(
  args: Record<string, unknown>,
  events: DouniSSEEvent[],
): Record<string, unknown> {
  const action = args.action as string;
  const payload: Record<string, unknown> = {};

  if (action === 'change_symbol' && args.symbol) {
    payload.symbol = (args.symbol as string).toUpperCase();
  }
  if (action === 'change_timeframe' && args.timeframe) {
    payload.timeframe = args.timeframe;
  }
  if (action === 'add_indicator' && args.indicator) {
    payload.indicator = args.indicator;
  }

  events.push({ type: 'chart_action', action, payload });

  return { action, ...payload, success: true };
}

// ─── save_pattern ───────────────────────────────────────────

function executeSavePattern(
  args: Record<string, unknown>,
  events: DouniSSEEvent[],
): Record<string, unknown> {
  // Phase 1: Return draft for user confirmation (no DB yet)
  const name = args.name as string;
  const conditions = args.conditions as unknown[];
  const direction = args.direction as string;

  events.push({
    type: 'pattern_draft',
    name,
    conditions,
    requiresConfirmation: true,
  });

  return {
    status: 'draft',
    name,
    direction,
    conditionCount: conditions.length,
    message: 'Pattern draft created. User confirmation required to save.',
  };
}

// ─── submit_feedback ────────────────────────────────────────

function executeSubmitFeedback(
  args: Record<string, unknown>,
  _events: DouniSSEEvent[],
): Record<string, unknown> {
  // Phase 1: Acknowledge feedback (no DB yet)
  return {
    status: 'acknowledged',
    target: args.target,
    result: args.result,
    note: args.note || null,
    message: 'Feedback recorded. Will be used for learning in Phase 2.',
  };
}

// ─── query_memory ───────────────────────────────────────────

function executeQueryMemory(
  args: Record<string, unknown>,
  _events: DouniSSEEvent[],
): Record<string, unknown> {
  // Phase 1: Stub (no persistent memory yet)
  return {
    status: 'empty',
    query: args.query,
    results: [],
    message: 'Memory system not yet connected. Will be available in Phase 2.',
  };
}

// fetchDerivatives removed in B7 — funding/open interest/top L/S are
// now `FUNDING_RATE`, `OPEN_INTEREST_POINT`, and `LONG_SHORT_TOP_1H`
// atoms read directly via `readRaw()`. See `providers/rawSources.ts`
// for the 5-second in-flight memos that dedupe concurrent reads.

// fetchFearGreed removed — callers now go through
// readRaw(KnownRawId.FEAR_GREED_VALUE, {}) which bridges to
// $lib/server/feargreed with cached TTL.
