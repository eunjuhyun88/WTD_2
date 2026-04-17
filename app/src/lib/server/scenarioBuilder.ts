// ═══════════════════════════════════════════════════════════════
// COGOCHI — Scenario Builder (Phase 4)
// Fetches real Binance klines for historical events, generates
// synthetic derivatives data (OI/funding/LS), caches to disk.
// ═══════════════════════════════════════════════════════════════

import { fetchKlines } from '$lib/api/binance.js';
import type { BattleScenario, OIRecord, FundingRecord, LSRecord } from '$lib/contracts/researchV4';
import type { BinanceKline } from '$lib/contracts/marketContext';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Scenario Catalog ────────────────────────────────────────

export interface ScenarioDef {
  id: string;
  label: string;
  symbol: string;
  interval: string;
  /** End timestamp in ms — fetches candles BEFORE this time */
  endTime: number;
  /** Number of candles to fetch */
  candleCount: number;
  /** Synthetic derivatives bias */
  fundingBias: number;  // positive = long-heavy market
  oiTrend: number;      // positive = rising OI
}

/** Well-known historical events with exact timestamps */
export const SCENARIO_CATALOG: ScenarioDef[] = [
  {
    id: 'ftx-crash-2022-4h',
    label: 'FTX Collapse — 2022-11-09 4H',
    symbol: 'BTCUSDT',
    interval: '4h',
    endTime: Date.UTC(2022, 10, 12, 0, 0, 0), // Nov 12 (3 days after)
    candleCount: 48, // ~8 days of 4h candles
    fundingBias: -0.02,
    oiTrend: -0.03,
  },
  {
    id: 'luna-crash-2022-4h',
    label: 'LUNA Crash — 2022-05-09 4H',
    symbol: 'BTCUSDT',
    interval: '4h',
    endTime: Date.UTC(2022, 4, 15, 0, 0, 0), // May 15
    candleCount: 48,
    fundingBias: -0.03,
    oiTrend: -0.05,
  },
  {
    id: 'covid-crash-2020-4h',
    label: 'COVID Crash — 2020-03-12 4H',
    symbol: 'BTCUSDT',
    interval: '4h',
    endTime: Date.UTC(2020, 2, 16, 0, 0, 0), // Mar 16
    candleCount: 48,
    fundingBias: -0.04,
    oiTrend: -0.06,
  },
  {
    id: 'bull-ath-2021-4h',
    label: 'Bull Run ATH — 2021-11-10 4H',
    symbol: 'BTCUSDT',
    interval: '4h',
    endTime: Date.UTC(2021, 10, 14, 0, 0, 0), // Nov 14
    candleCount: 48,
    fundingBias: 0.05,
    oiTrend: 0.04,
  },
  {
    id: 'eth-merge-2022-4h',
    label: 'ETH Merge — 2022-09-15 4H',
    symbol: 'ETHUSDT',
    interval: '4h',
    endTime: Date.UTC(2022, 8, 19, 0, 0, 0), // Sep 19
    candleCount: 48,
    fundingBias: 0.02,
    oiTrend: 0.01,
  },
  {
    id: 'btc-range-2023-1h',
    label: 'BTC Range Bound — 2023-06 1H',
    symbol: 'BTCUSDT',
    interval: '1h',
    endTime: Date.UTC(2023, 5, 15, 0, 0, 0), // Jun 15
    candleCount: 72, // 3 days of 1h candles
    fundingBias: 0.0,
    oiTrend: 0.0,
  },
];

// ─── Cache directory ────────────────────────────────────────

const CACHE_DIR = join(process.cwd(), 'static', 'scenarios');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCachePath(id: string): string {
  return join(CACHE_DIR, `${id}.json`);
}

// ─── Build scenario from real data ──────────────────────────

/**
 * Build a BattleScenario from real Binance klines.
 * Fetches from API on first call, then caches to static/scenarios/.
 */
export async function buildScenario(def: ScenarioDef): Promise<BattleScenario> {
  ensureCacheDir();
  const cachePath = getCachePath(def.id);

  // Try cache first
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf-8')) as BattleScenario;
      if (cached.candles?.length > 0) return cached;
    } catch {
      // Cache corrupted, refetch
    }
  }

  // Fetch real candles from Binance
  const candles = await fetchKlines(def.symbol, def.interval, def.candleCount, def.endTime);

  if (candles.length === 0) {
    throw new Error(`No candles returned for ${def.id}`);
  }

  // Generate synthetic derivatives data aligned to candle timestamps
  const oiHistory = generateSyntheticOI(candles, def.oiTrend);
  const fundingHistory = generateSyntheticFunding(candles, def.fundingBias);
  const lsRatioHistory = generateSyntheticLS(candles, def.fundingBias);

  const scenario: BattleScenario = {
    id: def.id,
    label: def.label,
    candles,
    oiHistory,
    fundingHistory,
    lsRatioHistory,
    startTimestamp: candles[0].time * 1000,
    endTimestamp: candles[candles.length - 1].time * 1000,
  };

  // Cache to disk
  try {
    writeFileSync(cachePath, JSON.stringify(scenario), 'utf-8');
  } catch {
    // Non-fatal — continue without cache
  }

  return scenario;
}

/**
 * Build scenario by ID from the catalog.
 * Returns null if ID not found.
 */
export async function buildScenarioById(id: string): Promise<BattleScenario | null> {
  const def = SCENARIO_CATALOG.find(s => s.id === id);
  if (!def) return null;
  return buildScenario(def);
}

/**
 * Build a custom scenario from any symbol/interval/time range.
 */
export async function buildCustomScenario(
  symbol: string,
  interval: string,
  endTime: number,
  candleCount: number = 48,
  label?: string,
): Promise<BattleScenario> {
  const id = `custom-${symbol.toLowerCase()}-${interval}-${endTime}`;
  const def: ScenarioDef = {
    id,
    label: label ?? `${symbol} ${interval} custom`,
    symbol,
    interval,
    endTime,
    candleCount,
    fundingBias: 0,
    oiTrend: 0,
  };
  return buildScenario(def);
}

/**
 * List all available scenarios (catalog + cached custom).
 */
export function listScenarios(): { id: string; label: string; cached: boolean }[] {
  const result = SCENARIO_CATALOG.map(s => ({
    id: s.id,
    label: s.label,
    cached: existsSync(getCachePath(s.id)),
  }));
  return result;
}

// ─── Synthetic derivatives generators ────────────────────────
// These generate realistic-looking OI/funding/LS data aligned
// to actual candle timestamps and price movements.

function generateSyntheticOI(candles: BinanceKline[], trendBias: number): OIRecord[] {
  let oi = 5_000_000_000;
  return candles.map((c, i) => {
    // OI correlates with price moves + trend bias
    const priceMove = i > 0 ? (c.close - candles[i - 1].close) / candles[i - 1].close : 0;
    const volumeFactor = c.volume / 3000; // normalized volume influence
    const noise = (Math.random() - 0.5) * 100_000_000;
    const trendDelta = oi * trendBias * 0.01;
    const priceDelta = oi * priceMove * 0.3; // OI rises with price in trend

    const delta = trendDelta + priceDelta + noise;
    oi = Math.max(1_000_000_000, oi + delta);

    return {
      timestamp: c.time * 1000,
      openInterest: oi,
      delta,
    };
  });
}

function generateSyntheticFunding(candles: BinanceKline[], bias: number): FundingRecord[] {
  let funding = bias * 0.5;
  return candles.map((c, i) => {
    // Funding correlates with consecutive price moves
    const priceMove = i > 0 ? (c.close - candles[i - 1].close) / candles[i - 1].close : 0;
    funding += priceMove * 0.5; // positive moves → positive funding
    funding += (bias - funding) * 0.1; // mean-revert toward bias
    funding += (Math.random() - 0.5) * 0.01; // noise
    // Occasional spikes
    if (Math.random() > 0.9) funding += (Math.random() - 0.5) * 0.06;
    // Clamp
    funding = Math.max(-0.15, Math.min(0.15, funding));

    return {
      timestamp: c.time * 1000,
      fundingRate: funding,
    };
  });
}

function generateSyntheticLS(candles: BinanceKline[], fundingBias: number): LSRecord[] {
  return candles.map((c, i) => {
    // LS ratio loosely correlated with funding direction
    const base = 0.5 + fundingBias * 2; // bias shifts ratio
    const noise = (Math.random() - 0.5) * 0.1;
    const longRatio = Math.max(0.3, Math.min(0.7, base + noise));

    return {
      timestamp: c.time * 1000,
      longRatio,
      shortRatio: 1 - longRatio,
    };
  });
}
