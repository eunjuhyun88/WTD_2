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

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface KlineBar {
  t: number;   // open-time ms UTC
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  tbv: number; // taker buy base volume (absolute, not ratio)
}

export interface PerpSnapshot {
  funding_rate?: number;
  oi_change_1h?: number;
  oi_change_24h?: number;
  long_short_ratio?: number;
  taker_buy_ratio?: number;
}

// ---------------------------------------------------------------------------
// /score
// ---------------------------------------------------------------------------

export interface SignalSnapshotRaw {
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

export interface ScoreResult {
  snapshot: SignalSnapshotRaw;
  p_win: number | null;             // null until LightGBM trained
  blocks_triggered: string[];       // active building block names
  ensemble: EnsembleSignal | null;  // fused ML + blocks signal
  ensemble_triggered: boolean;      // convenience: confidence in (high|medium) && direction != neutral
}

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

export interface BacktestResult {
  metrics: BacktestMetrics;
  passed: boolean;
  gate_failures: string[];
}

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

export interface ChallengeCreateResult {
  slug: string;
  strategies: StrategyResult[];
  recommended: string;
  feature_vector: number[];
}

export interface ScanMatch {
  symbol: string;
  timestamp: string;
  similarity: number;
  p_win: number | null;
  price: number;
}

export interface ChallengeScanResult {
  slug: string;
  scanned_at: string;
  matches: ScanMatch[];
}

// ---------------------------------------------------------------------------
// /train
// ---------------------------------------------------------------------------

export interface TradeRecord {
  snapshot: Record<string, unknown>;
  outcome: 1 | 0 | -1;
}

export interface TrainResult {
  auc: number;
  n_samples: number;
  model_version: string;
}

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
): Promise<T> {
  const url = `${ENGINE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: body ? { 'Content-Type': 'application/json' } : {},
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
  async score(symbol: string, klines: KlineBar[], perp: PerpSnapshot = {}): Promise<ScoreResult> {
    return call<ScoreResult>('POST', '/score', { symbol, klines, perp });
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
