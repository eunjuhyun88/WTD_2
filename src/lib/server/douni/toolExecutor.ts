// ═══════════════════════════════════════════════════════════════
// DOUNI — Tool Executor
// ═══════════════════════════════════════════════════════════════
//
// LLM의 tool_call을 실제 실행하고 결과를 반환.
// 각 도구는 기존 서비스를 호출하여 결과를 생성.

import type { ToolCall, ToolResult, ToolExecutorContext, DouniSSEEvent } from './types';
import type { SignalSnapshot } from '$lib/engine/cogochi/types';
import { VALID_TOOL_NAMES } from './tools';
import { fetchKlinesServer, fetch24hrServer } from '../binance';
import { computeSignalSnapshot, computeIndicatorSeries } from '$lib/engine/cogochi/layerEngine';
import { detectSupportResistance } from '$lib/engine/cogochi/supportResistance';
import { signSnapshot } from '$lib/engine/cogochi/hmac';
import type { MarketContext } from '$lib/engine/factorEngine';

const FAPI = 'https://fapi.binance.com';

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

  // Fetch all data in parallel (same logic as /api/cogochi/analyze)
  const [klines, klines1h, klines1d, ticker, deriv, fearGreed] = await Promise.all([
    fetchKlinesServer(symbol, tf, 200),
    fetchKlinesServer(symbol, '1h', 100).catch(() => []),
    fetchKlinesServer(symbol, '1d', 50).catch(() => []),
    fetch24hrServer(symbol).catch(() => null),
    fetchDerivatives(symbol),
    fetchFearGreed(),
  ]);

  if (!klines.length) {
    throw new Error(`No kline data for ${symbol}`);
  }

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
      oi: deriv.oi,
      funding: deriv.funding,
      lsRatio: deriv.lsRatio,
    },
    sentiment: { fearGreed },
  };

  const snapshot = computeSignalSnapshot(marketCtx, symbol, tf);
  snapshot.hmac = signSnapshot(snapshot);

  // Cache for future use
  ctx.cachedSnapshot = snapshot;
  ctx.symbol = symbol;
  ctx.timeframe = tf;

  // Emit layer results as individual events for UI
  const layerEntries: Array<{ layer: string; score: number; signal: string; detail?: string }> = [
    { layer: 'L1', score: snapshot.l1.score, signal: snapshot.l1.phase },
    { layer: 'L2', score: snapshot.l2.score, signal: `FR:${(snapshot.l2.fr * 100).toFixed(3)}%` },
    { layer: 'L3', score: snapshot.l3.score, signal: snapshot.l3.v_surge ? 'SURGE' : 'NORMAL' },
    { layer: 'L10', score: snapshot.l10.score, signal: snapshot.l10.mtf_confluence },
    { layer: 'L11', score: snapshot.l11.score, signal: snapshot.l11.cvd_state },
    { layer: 'L13', score: snapshot.l13.score, signal: snapshot.l13.breakout ? 'BREAKOUT' : 'NO' },
  ];

  for (const entry of layerEntries) {
    events.push({ type: 'layer_result', ...entry });
  }

  // Chart klines for side panel
  const chartKlines = klines.slice(-100).map(k => ({
    t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
  }));

  // S/R annotations + indicator series (Sprint 1)
  const currentPrice = klines[klines.length - 1].close;
  const annotations = detectSupportResistance(klines, currentPrice);
  const indicatorSeries = computeIndicatorSeries(klines);

  return {
    symbol,
    timeframe: tf,
    alphaScore: snapshot.alphaScore,
    alphaLabel: snapshot.alphaLabel,
    regime: snapshot.regime,
    l1: snapshot.l1,
    l2: snapshot.l2,
    l3: snapshot.l3,
    l7: snapshot.l7,
    l10: snapshot.l10,
    l11: snapshot.l11,
    l13: snapshot.l13,
    l14: snapshot.l14,
    l15: snapshot.l15,
    price: currentPrice,
    change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
    chart: chartKlines,
    derivatives: {
      funding: deriv.funding,
      oi: deriv.oi,
      lsRatio: deriv.lsRatio,
    },
    annotations,
    indicators: {
      bbUpper: indicatorSeries.bbUpper?.slice(-100),
      bbMiddle: indicatorSeries.bbMiddle?.slice(-100),
      bbLower: indicatorSeries.bbLower?.slice(-100),
      ema20: indicatorSeries.ema20?.slice(-100),
    },
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
    fetchFearGreed(),
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

// ─── scan_market ────────────────────────────────────────────

async function executeScanMarket(
  args: Record<string, unknown>,
  events: DouniSSEEvent[],
): Promise<Record<string, unknown>> {
  const sort = (args.sort as string) || 'galaxy_score';
  const limit = Math.min((args.limit as number) || 10, 20);
  const sector = args.sector as string | undefined;

  const timeout = AbortSignal.timeout(8000);

  // Use CoinGecko markets + trending APIs
  const [marketsRes, trendRes] = await Promise.all([
    fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h,7d`,
      { signal: timeout },
    ).catch(() => null),
    fetch('https://api.coingecko.com/api/v3/search/trending', { signal: timeout }).catch(() => null),
  ]);

  const marketsData = marketsRes?.ok ? await marketsRes.json().catch(() => null) : null;
  const trendData = trendRes?.ok ? await trendRes.json().catch(() => null) : null;

  // Build trending set for cross-reference
  const trendingIds = new Set((trendData?.coins || []).map((c: any) => c.item?.id));

  if (!marketsData || !Array.isArray(marketsData)) {
    // Pure fallback to trending
    const trending = (trendData?.coins || []).slice(0, limit).map((c: any, i: number) => ({
      rank: i + 1,
      name: c.item?.name || '',
      symbol: (c.item?.symbol || '').toUpperCase(),
      price: c.item?.data?.price || null,
      change24h: c.item?.data?.price_change_percentage_24h?.usd || null,
      market_cap_rank: c.item?.market_cap_rank || null,
      is_trending: true,
    }));
    return { source: 'coingecko_trending', sort: 'trending', coins: trending };
  }

  const coins = marketsData.slice(0, limit).map((c: any, i: number) => ({
    rank: i + 1,
    name: c.name,
    symbol: (c.symbol || '').toUpperCase(),
    price: c.current_price,
    change24h: c.price_change_percentage_24h,
    change7d: c.price_change_percentage_7d_in_currency || null,
    market_cap: c.market_cap,
    market_cap_rank: c.market_cap_rank,
    volume_24h: c.total_volume,
    is_trending: trendingIds.has(c.id),
  }));

  events.push({ type: 'scan_result', sort, count: coins.length });

  return {
    source: 'coingecko',
    sort,
    sector: sector || 'all',
    coins,
    trending_coins: (trendData?.coins || []).slice(0, 5).map((c: any) => ({
      name: c.item?.name,
      symbol: (c.item?.symbol || '').toUpperCase(),
    })),
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

// ─── Helper: Fetch derivatives (reused from analyze endpoint) ──

async function fetchDerivatives(symbol: string) {
  const timeout = AbortSignal.timeout(5000);
  try {
    const [frRes, oiRes] = await Promise.all([
      fetch(`${FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`, { signal: timeout }),
      fetch(`${FAPI}/fapi/v1/openInterest?symbol=${symbol}`, { signal: timeout }),
    ]);

    const fr = frRes.ok ? await frRes.json() : null;
    const oi = oiRes.ok ? await oiRes.json() : null;

    let lsRatio: number | null = null;
    try {
      const lsRes = await fetch(
        `${FAPI}/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (lsRes.ok) {
        const lsData = await lsRes.json();
        if (Array.isArray(lsData) && lsData.length > 0) {
          lsRatio = parseFloat(lsData[0].longShortRatio) || null;
        }
      }
    } catch { /* skip */ }

    return {
      funding: fr ? parseFloat(fr.lastFundingRate) : null,
      oi: oi ? parseFloat(oi.openInterest) : null,
      lsRatio,
    };
  } catch {
    return { funding: null, oi: null, lsRatio: null };
  }
}

async function fetchFearGreed(): Promise<number | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseInt(data?.data?.[0]?.value) || null;
  } catch {
    return null;
  }
}
