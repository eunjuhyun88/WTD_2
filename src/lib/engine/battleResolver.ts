// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Real-Time Battle Resolver
// ═══════════════════════════════════════════════════════════════
//
// Subscribes to live Binance price feed (via priceStore) and
// resolves the battle when TP/SL is hit or time expires.
// Replaces the old Math.random() 8-second fake simulation.

import { get } from 'svelte/store';
import { btcPrice } from '$lib/stores/priceStore';
import type { Direction } from '$lib/stores/gameState';

// ─── Types ───────────────────────────────────────────────────

export interface BattleConfig {
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  direction: Direction;
  speed: number;       // 1-5, affects timeout duration
  pair?: string;       // default BTC
}

export type BattleResult = 'tp' | 'sl' | 'timeout_win' | 'timeout_loss';

export interface BattlePriceTick {
  ts: number;
  price: number;
}

export interface BattleTickState {
  status: 'running' | BattleResult;
  currentPrice: number;
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  direction: Direction;

  // Distance metrics (0-100%)
  distToTP: number;        // 0 = at entry, 100 = at TP
  distToSL: number;        // 0 = at entry, 100 = at SL

  // Tracking
  priceHistory: BattlePriceTick[];
  highSinceEntry: number;
  lowSinceEntry: number;
  maxRunup: number;        // best % gain from entry
  maxDrawdown: number;     // worst % loss from entry

  // Timing
  elapsed: number;         // ms since battle start
  duration: number;        // total allowed ms
  timeProgress: number;    // 0-100%

  // P&L
  pnlPercent: number;      // current P&L %
  pnlAbsolute: number;     // current P&L $

  // Resolution (set when status !== 'running')
  exitPrice?: number;
  exitTime?: number;
  result?: BattleResult;
  rAchieved?: number;      // R multiples achieved
}

// ─── Constants ───────────────────────────────────────────────

const BASE_DURATION_MS = 120_000;  // 2 minutes at speed=1
const MIN_DURATION_MS = 20_000;    // minimum 20 seconds

// ─── Factory ─────────────────────────────────────────────────

export function createBattleResolver(config: BattleConfig) {
  const { entryPrice, tpPrice, slPrice, direction, speed } = config;
  const isLong = direction === 'LONG';

  // Calculate battle duration based on speed
  const duration = Math.max(MIN_DURATION_MS, BASE_DURATION_MS / Math.max(1, speed));
  const startTime = Date.now();

  // Initial state
  const state: BattleTickState = {
    status: 'running',
    currentPrice: entryPrice,
    entryPrice,
    tpPrice,
    slPrice,
    direction,
    distToTP: 0,
    distToSL: 0,
    priceHistory: [{ ts: startTime, price: entryPrice }],
    highSinceEntry: entryPrice,
    lowSinceEntry: entryPrice,
    maxRunup: 0,
    maxDrawdown: 0,
    elapsed: 0,
    duration,
    timeProgress: 0,
    pnlPercent: 0,
    pnlAbsolute: 0,
  };

  let callback: ((tick: BattleTickState) => void) | null = null;
  let unsub: (() => void) | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  function computeDistances(price: number): { distToTP: number; distToSL: number } {
    const tpDist = Math.abs(tpPrice - entryPrice);
    const slDist = Math.abs(slPrice - entryPrice);

    if (isLong) {
      // LONG: TP is above, SL is below
      const progressToTP = tpDist > 0 ? Math.max(0, Math.min(100, ((price - entryPrice) / tpDist) * 100)) : 0;
      const progressToSL = slDist > 0 ? Math.max(0, Math.min(100, ((entryPrice - price) / slDist) * 100)) : 0;
      return { distToTP: progressToTP, distToSL: progressToSL };
    } else {
      // SHORT: TP is below, SL is above
      const progressToTP = tpDist > 0 ? Math.max(0, Math.min(100, ((entryPrice - price) / tpDist) * 100)) : 0;
      const progressToSL = slDist > 0 ? Math.max(0, Math.min(100, ((price - entryPrice) / slDist) * 100)) : 0;
      return { distToTP: progressToTP, distToSL: progressToSL };
    }
  }

  function checkResolution(price: number): BattleResult | null {
    if (isLong) {
      if (price >= tpPrice) return 'tp';
      if (price <= slPrice) return 'sl';
    } else {
      if (price <= tpPrice) return 'tp';
      if (price >= slPrice) return 'sl';
    }
    return null;
  }

  function resolve(result: BattleResult, price: number) {
    if (destroyed || state.status !== 'running') return;

    const riskAmount = Math.abs(entryPrice - slPrice);
    const pnl = isLong ? price - entryPrice : entryPrice - price;
    const rAchieved = riskAmount > 0 ? pnl / riskAmount : 0;

    state.status = result;
    state.result = result;
    state.exitPrice = price;
    state.exitTime = Date.now();
    state.rAchieved = rAchieved;

    if (callback) callback({ ...state });
    destroy();
  }

  function onPriceTick(price: number) {
    if (destroyed || state.status !== 'running') return;
    if (!Number.isFinite(price) || price <= 0) return;

    const now = Date.now();
    state.currentPrice = price;
    state.elapsed = now - startTime;
    state.timeProgress = Math.min(100, (state.elapsed / duration) * 100);

    // Record tick
    state.priceHistory.push({ ts: now, price });

    // Update high/low tracking
    state.highSinceEntry = Math.max(state.highSinceEntry, price);
    state.lowSinceEntry = Math.min(state.lowSinceEntry, price);

    // P&L calculation
    const pnl = isLong ? price - entryPrice : entryPrice - price;
    state.pnlPercent = entryPrice > 0 ? (pnl / entryPrice) * 100 : 0;
    state.pnlAbsolute = pnl;

    // Max runup/drawdown
    const runup = isLong
      ? ((state.highSinceEntry - entryPrice) / entryPrice) * 100
      : ((entryPrice - state.lowSinceEntry) / entryPrice) * 100;
    const drawdown = isLong
      ? ((entryPrice - state.lowSinceEntry) / entryPrice) * 100
      : ((state.highSinceEntry - entryPrice) / entryPrice) * 100;

    state.maxRunup = Math.max(state.maxRunup, runup);
    state.maxDrawdown = Math.max(state.maxDrawdown, drawdown);

    // Distances
    const { distToTP, distToSL } = computeDistances(price);
    state.distToTP = distToTP;
    state.distToSL = distToSL;

    // Check TP/SL resolution
    const result = checkResolution(price);
    if (result) {
      resolve(result, price);
      return;
    }

    // Emit tick
    if (callback) callback({ ...state });
  }

  function start() {
    // Subscribe to real-time BTC price from priceStore
    unsub = btcPrice.subscribe((price) => {
      if (price > 0) onPriceTick(price);
    });

    // Timeout timer
    timeoutTimer = setTimeout(() => {
      if (destroyed || state.status !== 'running') return;
      const finalPrice = get(btcPrice) || state.currentPrice;
      const pnl = isLong ? finalPrice - entryPrice : entryPrice - finalPrice;
      const result: BattleResult = pnl > 0 ? 'timeout_win' : 'timeout_loss';
      resolve(result, finalPrice);
    }, duration);
  }

  function destroy() {
    destroyed = true;
    if (unsub) { unsub(); unsub = null; }
    if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    callback = null;
  }

  return {
    /** Start receiving ticks. Call the callback on every price update. */
    subscribe(cb: (tick: BattleTickState) => void) {
      callback = cb;
      start();
      return () => destroy();
    },

    /** Force-stop the resolver */
    destroy,

    /** Get current state snapshot */
    getState: () => ({ ...state }),

    /** Duration in ms */
    duration,
  };
}
