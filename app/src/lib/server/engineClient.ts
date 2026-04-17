/**
 * Cogochi Engine Client — typed HTTP client for the Python FastAPI engine.
 *
 * Design:
 *  - Engine URL comes from ENGINE_URL env var (default: http://localhost:8000)
 *  - All calls have a 10-second timeout (engine does IO-bound work)
 *  - Errors propagate as typed EngineError with status + message
 *  - TypeScript types mirror the Python Pydantic schemas in api/schemas.py
 *
 * Usage (server-side only):
 *   import { engine } from '$lib/server/engineClient';
 *   const { snapshot, p_win } = await engine.score(symbol, klines, perp);
 */

import { env } from '$env/dynamic/private';
import type { components, operations } from '$lib/contracts/generated/engine-openapi';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type JsonResponse<T extends { responses: unknown }> =
  T extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R : never;

type Schema<K extends keyof components['schemas']> = components['schemas'][K];

export type KlineBar = Schema<'KlineBar'>;
export type PerpSnapshot = Partial<Schema<'PerpSnapshot'>>;

// ---------------------------------------------------------------------------
// /deep — extended perp data for market_engine pipeline
// ---------------------------------------------------------------------------

/**
 * Extended derivatives data for the full market_engine pipeline (POST /deep).
 *
 * fr         : raw Binance decimal (0.0001 = 0.01%/8h; max ±0.0075)
 * oi_pct     : percent change, e.g. 5.0 = +5%
 * oi_notional: OI in USD = raw OI coins × mark_price
 * vol_24h    : 24h quote volume in USD (ticker.quoteVolume)
 * short_liq_usd: forceOrders BUY side sum in USD (shorts force-closed)
 * long_liq_usd : forceOrders SELL side sum in USD (longs force-closed)
 */
export type DeepPerpData = Partial<Schema<'DeepPerpData'>>;

export interface LayerOut {
  score: number;
  sigs: Array<{ t: string; type: 'bull' | 'bear' | 'neut' | 'warn' }>;
  meta: Record<string, unknown>;
}

export interface DeepResult {
  symbol: string;
  total_score: number;
  verdict: string;
  layers: Record<string, LayerOut>;
  atr_levels: {
    atr?: number;
    atr_pct?: number;
    pct_rank?: number;
    tier?: string;
    stop_long?: number;
    stop_short?: number;
    tp1_long?: number;
    tp2_long?: number;
    tp1_short?: number;
    [key: string]: unknown;
  };
  alpha: Record<string, unknown> | null;
  hunt_score: number | null;
}

// ---------------------------------------------------------------------------
// /universe — CoinMarketCap-level token list
// ---------------------------------------------------------------------------

export interface TokenInfo {
  rank: number;
  symbol: string;
  base: string;
  name: string;
  sector: string;
  price: number;
  pct_24h: number;
  vol_24h_usd: number;
  market_cap: number;
  oi_usd: number;
  is_futures: boolean;
  trending_score: number;
}

export interface UniverseResult {
  total: number;
  tokens: TokenInfo[];
  updated_at: string;
}

// ---------------------------------------------------------------------------
// /opportunity
// ---------------------------------------------------------------------------

export interface OpportunityScoreResult {
  symbol: string;
  name: string;
  slug: string;
  price: number;
  change1h: number;
  change24h: number;
  change7d: number;
  volume24h: number;
  marketCap: number;
  momentumScore: number;
  volumeScore: number;
  socialScore: number;
  macroScore: number;
  onchainScore: number;
  totalScore: number;
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  reasons: string[];
  sentiment?: number | null;
  socialVolume?: number | null;
  galaxyScore?: number | null;
  alerts: string[];
}

export interface OpportunityMacroBackdrop {
  fedFundsRate: number | null;
  yieldCurveSpread: number | null;
  m2ChangePct: number | null;
  overallMacroScore: number;
  regime: 'risk-on' | 'risk-off' | 'neutral';
}

export interface OpportunityScanEngineResult {
  coins: OpportunityScoreResult[];
  macroBackdrop: OpportunityMacroBackdrop;
  scannedAt: number;
  scanDurationMs: number;
}

// ---------------------------------------------------------------------------
// /rag
// ---------------------------------------------------------------------------

export interface RagScanSignal {
  agentId: string;
  vote: string;
  confidence: number;
}

export interface RagVectorResult {
  embedding: number[];
}

export interface RagDedupeHashResult {
  dedupeHash: string;
}

// ---------------------------------------------------------------------------
// /score
// ---------------------------------------------------------------------------

export interface SignalSnapshotRaw {
  schema_version: number;
  symbol: string;
  timestamp: string;
  price: number;
  ema20_slope: number;
  ema50_slope: number;
  ema_alignment: 'bullish' | 'neutral' | 'bearish';
  price_vs_ema50: number;
  rsi14: number;
  rsi14_slope: number;
  macd_hist: number;
  roc_10: number;
  atr_pct: number;
  atr_ratio_short_long: number;
  bb_width: number;
  bb_position: number;
  volume_24h: number;
  vol_ratio_3: number;
  obv_slope: number;
  htf_structure: 'uptrend' | 'range' | 'downtrend';
  dist_from_20d_high: number;
  dist_from_20d_low: number;
  swing_pivot_distance: number;
  funding_rate: number;
  oi_change_1h: number;
  oi_change_24h: number;
  long_short_ratio: number;
  cvd_state: 'buying' | 'neutral' | 'selling';
  taker_buy_ratio_1h: number;
  regime: 'risk_on' | 'chop' | 'risk_off';
  hour_of_day: number;
  day_of_week: number;
}

export interface EnsembleSignal {
  direction: 'strong_long' | 'long' | 'neutral' | 'short' | 'strong_short';
  ensemble_score: number;        // [0, 1] overall conviction
  ml_contribution: number;
  block_contribution: number;
  regime_contribution: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  block_analysis: {
    entries: string[];
    triggers: string[];
    confirmations: string[];
    disqualifiers: string[];
    n_categories_active: number;
    net_direction: string;
  };
}

export type ScoreResult = JsonResponse<operations['score_score_post']>;

// ---------------------------------------------------------------------------
// /backtest
// ---------------------------------------------------------------------------

export interface BlockSet {
  triggers?: string[];
  confirmations?: string[];
  entries?: string[];
  disqualifiers?: string[];
}

export interface BacktestConfig {
  stop_loss?: number;
  take_profit?: number;
  timeout_bars?: number;
  universe?: string;
}

export interface BacktestMetrics {
  n_trades: number;
  win_rate: number;
  expectancy: number;
  profit_factor: number;
  max_drawdown: number;
  sortino: number;
  walk_forward_pass_rate: number;
}

export type BacktestResult = JsonResponse<operations['backtest_backtest_post']>;

// ---------------------------------------------------------------------------
// /challenge
// ---------------------------------------------------------------------------

export interface SnapInput {
  symbol: string;
  timestamp: string;  // ISO-8601
  label?: string;
}

export interface StrategyResult {
  name: string;
  win_rate: number;
  match_count: number;
  expectancy: number;
}

export type ChallengeCreateResult = JsonResponse<operations['create_challenge_challenge_create_post']>;

export interface ScanMatch {
  symbol: string;
  timestamp: string;
  similarity: number;
  p_win: number | null;
  price: number;
}

export type ChallengeScanResult = JsonResponse<operations['scan_challenge_challenge__slug__scan_get']>;

// ---------------------------------------------------------------------------
// /train
// ---------------------------------------------------------------------------

export interface TradeRecord {
  snapshot: Record<string, unknown>;
  outcome: 1 | 0 | -1;
}

export type TrainResult = JsonResponse<operations['train_train_post']>;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class EngineError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  options?: { requestId?: string },
): Promise<T> {
  const url = `${ENGINE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (options?.requestId) headers['x-request-id'] = options.requestId;

    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const err = await res.json();
        detail = err.detail ?? err.message ?? detail;
      } catch { /* ignore parse errors */ }
      throw new EngineError(res.status, `Engine ${path} failed: ${detail}`);
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new EngineError(504, `Engine ${path} timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const engine = {
  /** Compute feature snapshot + P(win) for the latest kline bar. */
  async score(
    symbol: string,
    klines: KlineBar[],
    perp: PerpSnapshot = {},
    options?: { requestId?: string },
  ): Promise<ScoreResult> {
    return call<ScoreResult>('POST', '/score', { symbol, klines, perp }, options);
  },

  /**
   * Run full market_engine L2 pipeline (17 layers).
   * Returns DeepResult with per-layer scores, verdict, ATR stop/TP levels.
   * Requires ≥120 klines; 500 recommended for ATR percentile warmup.
   */
  async deep(
    symbol: string,
    klines: KlineBar[],
    perp: DeepPerpData = {},
    options?: { requestId?: string },
  ): Promise<DeepResult> {
    return call<DeepResult>('POST', '/deep', { symbol, klines, perp }, options);
  },

  /**
   * CoinMarketCap-style ranked token universe.
   * Options: limit (default 200), sector filter, sort field.
   */
  async universe(opts: { limit?: number; sector?: string; sort?: string } = {}): Promise<UniverseResult> {
    const params = new URLSearchParams();
    if (opts.limit)  params.set('limit',  String(opts.limit));
    if (opts.sector) params.set('sector', opts.sector);
    if (opts.sort)   params.set('sort',   opts.sort);
    const qs = params.size ? `?${params}` : '';
    return call<UniverseResult>('GET', `/universe${qs}`);
  },

  /** Remote opportunity scan over the engine token-universe cache. */
  async opportunityScan(limit = 15): Promise<OpportunityScanEngineResult> {
    return call<OpportunityScanEngineResult>('POST', '/opportunity/run', { limit });
  },

  async ragTerminalScanEmbedding(
    signals: RagScanSignal[],
    timeframe: string,
    dataCompleteness = 0.7,
  ): Promise<RagVectorResult> {
    return call<RagVectorResult>('POST', '/rag/terminal-scan', { signals, timeframe, dataCompleteness });
  },

  async ragQuickTradeEmbedding(params: {
    pair: string;
    direction: string;
    entryPrice: number;
    currentPrice: number;
    tp: number | null;
    sl: number | null;
    source: string;
    confidence?: number;
    timeframe?: string;
  }): Promise<RagVectorResult> {
    return call<RagVectorResult>('POST', '/rag/quick-trade', params);
  },

  async ragSignalActionEmbedding(params: {
    pair: string;
    direction: string;
    actionType: string;
    confidence: number | null;
    source: string;
    timeframe?: string;
  }): Promise<RagVectorResult> {
    return call<RagVectorResult>('POST', '/rag/signal-action', params);
  },

  async ragDedupeHash(params: {
    pair: string;
    timeframe: string;
    direction: string;
    regime: string;
    source: string;
    windowMinutes?: number;
  }): Promise<RagDedupeHashResult> {
    return call<RagDedupeHashResult>('POST', '/rag/dedupe-hash', params);
  },

  /** Run a portfolio backtest for a block set over the cached universe. */
  async backtest(blocks: BlockSet, config: BacktestConfig = {}): Promise<BacktestResult> {
    return call<BacktestResult>('POST', '/backtest', { blocks, config });
  },

  /** Register a new challenge from 1–5 reference snaps. */
  async createChallenge(
    snaps: SnapInput[],
    userId?: string,
  ): Promise<ChallengeCreateResult> {
    return call<ChallengeCreateResult>('POST', '/challenge/create', {
      snaps,
      user_id: userId,
    });
  },

  /** Scan current universe for bars matching a saved challenge. */
  async scanChallenge(slug: string): Promise<ChallengeScanResult> {
    return call<ChallengeScanResult>('GET', `/challenge/${slug}/scan`);
  },

  /** Retrain LightGBM on accumulated trade records. */
  async train(records: TradeRecord[], userId?: string): Promise<TrainResult> {
    return call<TrainResult>('POST', '/train', { records, user_id: userId });
  },

  /** Health check — returns true if engine is reachable. */
  async isHealthy(): Promise<boolean> {
    try {
      const res = await call<{ status: string }>('GET', '/healthz');
      return res.status === 'ok';
    } catch {
      return false;
    }
  },
};
