// ═══════════════════════════════════════════════════════════════
// CHATBATTLE — Battle Arena Store (Sprint B)
// ChartGame-style: 3 rounds x 5 bars = 15 bars, order-based trading
// Real Binance historical data, pure P/L (no HP)
// ═══════════════════════════════════════════════════════════════

import { writable, derived, get } from 'svelte/store';
import { addBattleRecord, getTodayBattleCount } from './matchHistoryStore';
import { recordAgentMatch, addMemoryCard, type MemoryCard } from './agentData';
import { fetchKlines } from '$lib/api/binance';

// ─── Types ───────────────────────────────────────────────────

export type BattlePhase = 'ready' | 'loading' | 'playing' | 'round_break' | 'result';
export type CallDir = 'LONG' | 'SHORT' | 'SKIP';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderAction = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'filled' | 'cancelled';

export interface Candle {
  time: number; // UTC seconds for lightweight-charts
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  cvd: number;
}

export interface TradeOrder {
  id: string;
  type: OrderType;
  action: OrderAction;
  price: number;
  shares: number;
  total: number;
  status: OrderStatus;
  filledAt: number | null; // bar index when filled
  filledPrice: number | null;
  createdAt: number; // bar index when created
}

export interface Position {
  type: 'long' | 'short' | null;
  shares: number;
  costBasis: number;
  stopPrice: number | null;
  unrealizedPL: number;
}

export interface CompletedTrade {
  id: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  shares: number;
  gainDollar: number;
  gainPercent: number;
  entryBar: number;
  exitBar: number;
}

export interface RoundDecision {
  round: number;
  aiCall: CallDir;
  aiConf: number;
  aiConfTarget: number; // target for animation
  aiReason: string;
  userAgreed: boolean | null; // kept for data tracking, no longer UI-driven
}

export interface EraInfo {
  symbol: string;
  startDate: string;
  endDate: string;
  timeframe: string;
}

export interface BattleState {
  phase: BattlePhase;
  candles: Candle[];
  revealedBars: number; // 0~15, how many bars revealed so far
  roundNumber: 1 | 2 | 3;
  roundTimer: number; // 30 -> 0 countdown per round
  selectedSymbol: string;
  era: EraInfo;
  position: Position;
  pendingOrders: TradeOrder[];
  completedTrades: CompletedTrade[];
  roundDecisions: RoundDecision[];
  aiConfidenceProgress: number; // 0 -> target animated value
  ddaMultiplier: number;
  autoPlay: boolean;
  battleNumber: number;
  totalBattles: number;
  resultPnl: number;
  resultWin: boolean;
  memoryCard: string | null;
  dailyLimitReached: boolean;
  todayCount: number;
}

// ─── Constants ────────────────────────────────────────────────

const HISTORY_BARS = 30;   // Pre-revealed context bars (visible from start)
const PLAY_BARS = 15;      // Bars to play through (3 rounds × 5)
const TOTAL_BARS = HISTORY_BARS + PLAY_BARS; // 45 total fetched
const BARS_PER_ROUND = 5;
const DAILY_BATTLE_LIMIT = 5;
const ROUND_TIMER_SECONDS = 30;
const DEFAULT_SHARES = 100;

export const SELECTABLE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;

const MEMORY_CARDS = [
  'Bull Accumulation', 'Bear Trap', 'Volume Climax', 'CVD Divergence',
  'Funding Flip', 'Liquidation Cascade', 'OI Surge', 'BB Squeeze',
  'MVRV Overshoot', 'Whale Exit', 'Retail FOMO', 'Smart Money Entry',
];

const AI_REASONS: Record<CallDir, string[]> = {
  LONG: [
    'CVD diverging bullish, accumulation zone',
    'Volume spike with bullish engulfing',
    'OI rising + positive funding = strong bid',
    'BB squeeze resolving upward',
    'MVRV entering value zone, expect bounce',
  ],
  SHORT: [
    'CVD diverging bearish, distribution zone',
    'Rising price on declining volume = weak',
    'Funding extreme positive, ready for flush',
    'OI declining, longs exiting',
    'MVRV overheated, correction due',
  ],
  SKIP: [
    'Consolidation, no clear direction',
    'Mixed signals, waiting for confirmation',
    'Low volume, unreliable price action',
  ],
};

// ─── Mock Candle Fallback ───────────────────────────────────

function generateMockCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 40000 + Math.random() * 20000;
  let cvd = 0;

  for (let i = 0; i < count; i++) {
    const volatility = 0.005 + Math.random() * 0.015;
    const change = (Math.random() - 0.5) * volatility * 2;
    const open = price;
    const close = price * (1 + change);
    const wick = Math.abs(close - open) * (0.3 + Math.random() * 0.7);
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick * (0.5 + Math.random() * 0.5);
    const volume = 500 + Math.random() * 2000;
    const buyVol = volume * (0.3 + Math.random() * 0.4);
    const sellVol = volume - buyVol;
    cvd += (buyVol - sellVol) * (close > open ? 1.1 : 0.9);

    candles.push({
      time: 1704067200 + i * 900,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume),
      cvd: Math.round(cvd),
    });

    price = close;
  }

  return candles;
}

function generateAICall(candles: Candle[], roundIdx: number): { call: CallDir; conf: number; reason: string } {
  const startBar = HISTORY_BARS + roundIdx * BARS_PER_ROUND;
  const candle = candles[startBar];
  if (!candle) return { call: 'SKIP', conf: 50, reason: 'No data available' };

  const isBullCandle = candle.close > candle.open;
  const rand = Math.random();

  let call: CallDir;
  if (rand < 0.12) {
    call = 'SKIP';
  } else if (rand < 0.62) {
    call = isBullCandle ? 'LONG' : 'SHORT';
  } else {
    call = isBullCandle ? 'SHORT' : 'LONG';
  }

  const conf = Math.round(55 + Math.random() * 35);
  const reasons = AI_REASONS[call];
  const reason = reasons[Math.floor(Math.random() * reasons.length)];

  return { call, conf, reason };
}

// ─── DDA (Dynamic Difficulty Adjustment) ─────────────────────

function computeDDAMultiplier(): number {
  if (typeof window === 'undefined') return 1.0;
  try {
    const raw = localStorage.getItem('cogochi_battle_records');
    if (!raw) return 1.0;
    const records = JSON.parse(raw) as Array<{ result: string }>;
    const recent = records.slice(0, 5);
    if (recent.length < 3) return 1.0;

    const recentWins = recent.filter(r => r.result === 'win').length;
    if (recentWins <= 1) return 0.7;
    if (recentWins >= 4) return 1.5;
    return 1.0;
  } catch {
    return 1.0;
  }
}

// ─── Store ───────────────────────────────────────────────────

function createEmptyPosition(): Position {
  return { type: null, shares: 0, costBasis: 0, stopPrice: null, unrealizedPL: 0 };
}

function createInitialState(): BattleState {
  const todayCount = typeof window !== 'undefined' ? getTodayBattleCount() : 0;
  const dda = computeDDAMultiplier();

  return {
    phase: 'ready',
    candles: [],
    revealedBars: 0,
    roundNumber: 1,
    roundTimer: ROUND_TIMER_SECONDS,
    selectedSymbol: 'BTCUSDT',
    era: { symbol: '', startDate: '', endDate: '', timeframe: '15m' },
    position: createEmptyPosition(),
    pendingOrders: [],
    completedTrades: [],
    roundDecisions: [],
    aiConfidenceProgress: 0,
    ddaMultiplier: dda,
    autoPlay: false,
    battleNumber: todayCount + 1,
    totalBattles: DAILY_BATTLE_LIMIT,
    resultPnl: 0,
    resultWin: false,
    memoryCard: null,
    dailyLimitReached: todayCount >= DAILY_BATTLE_LIMIT,
    todayCount,
  };
}

export const battleStore = writable<BattleState>(createInitialState());

// ─── Derived ────────────────────────────────────────────────

export const battlePhase = derived(battleStore, $s => $s.phase);
export const currentPrice = derived(battleStore, $s => {
  if ($s.revealedBars <= 0) return $s.candles[0]?.close ?? 0;
  const idx = Math.min($s.revealedBars - 1, $s.candles.length - 1);
  return $s.candles[idx]?.close ?? 0;
});
export const revealedCandles = derived(battleStore, $s =>
  $s.candles.slice(0, $s.revealedBars)
);
export const currentRoundDecision = derived(battleStore, $s => {
  return $s.roundDecisions[$s.roundNumber - 1] ?? null;
});
export const progressPct = derived(battleStore, $s => {
  const playBars = Math.max(0, $s.revealedBars - HISTORY_BARS);
  return Math.round((playBars / PLAY_BARS) * 100);
});
export const roundBarIndex = derived(battleStore, $s => {
  const playBars = Math.max(0, $s.revealedBars - HISTORY_BARS);
  const base = ($s.roundNumber - 1) * BARS_PER_ROUND;
  return playBars - base;
});
export const totalPnL = derived(battleStore, $s =>
  $s.completedTrades.reduce((sum, t) => sum + t.gainDollar, 0) + ($s.position.unrealizedPL || 0)
);

// ─── Binance Data Fetch ────────────────────────────────────

function formatDateFromTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

async function fetchHistoricalCandles(symbol: string): Promise<{ candles: Candle[]; era: EraInfo }> {
  // Random endTime: 30 days to 730 days ago
  const minOffset = 30 * 24 * 60 * 60 * 1000;
  const maxOffset = 730 * 24 * 60 * 60 * 1000;
  const randomOffset = minOffset + Math.random() * (maxOffset - minOffset);
  const endTime = Date.now() - randomOffset;

  const klines = await fetchKlines(symbol, '15m', TOTAL_BARS, endTime);

  if (klines.length < TOTAL_BARS) {
    throw new Error(`Not enough klines: got ${klines.length}, need ${TOTAL_BARS}`);
  }

  // Build candles with CVD
  let cvd = 0;
  const candles: Candle[] = klines.slice(0, TOTAL_BARS).map(k => {
    const buyVol = k.volume * (0.3 + Math.random() * 0.4);
    const sellVol = k.volume - buyVol;
    cvd += (buyVol - sellVol) * (k.close > k.open ? 1.1 : 0.9);
    return {
      time: k.time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      cvd: Math.round(cvd),
    };
  });

  const firstTime = candles[0].time;
  const lastTime = candles[candles.length - 1].time;

  const era: EraInfo = {
    symbol,
    startDate: formatDateFromTimestamp(firstTime),
    endDate: formatDateFromTimestamp(lastTime),
    timeframe: '15m',
  };

  return { candles, era };
}

// ─── Order Execution ────────────────────────────────────────

function tryFillOrders(s: BattleState, newCandle: Candle): void {
  const toFill: TradeOrder[] = [];

  for (const order of s.pendingOrders) {
    if (order.status !== 'pending') continue;

    let shouldFill = false;
    let fillPrice = order.price;

    if (order.type === 'market') {
      shouldFill = true;
      fillPrice = newCandle.open;
    } else if (order.type === 'limit') {
      if (order.action === 'buy' && newCandle.low <= order.price) {
        shouldFill = true;
        fillPrice = order.price;
      } else if (order.action === 'sell' && newCandle.high >= order.price) {
        shouldFill = true;
        fillPrice = order.price;
      }
    } else if (order.type === 'stop') {
      if (order.action === 'sell' && newCandle.low <= order.price) {
        shouldFill = true;
        fillPrice = order.price;
      } else if (order.action === 'buy' && newCandle.high >= order.price) {
        shouldFill = true;
        fillPrice = order.price;
      }
    }

    if (shouldFill) {
      order.status = 'filled';
      order.filledAt = s.revealedBars;
      order.filledPrice = fillPrice;
      toFill.push(order);
    }
  }

  // Execute filled orders
  for (const order of toFill) {
    const fp = order.filledPrice ?? order.price;
    if (order.action === 'buy') {
      if (s.position.type === 'short') {
        const gain = (s.position.costBasis - fp) * s.position.shares;
        const gainPct = ((s.position.costBasis - fp) / s.position.costBasis) * 100;
        s.completedTrades.push({
          id: order.id,
          direction: 'short',
          entryPrice: s.position.costBasis,
          exitPrice: fp,
          shares: s.position.shares,
          gainDollar: Math.round(gain * 100) / 100,
          gainPercent: Math.round(gainPct * 100) / 100,
          entryBar: 0,
          exitBar: s.revealedBars,
        });
        s.position = createEmptyPosition();
      } else {
        s.position = {
          type: 'long',
          shares: order.shares,
          costBasis: fp,
          stopPrice: null,
          unrealizedPL: 0,
        };
      }
    } else {
      if (s.position.type === 'long') {
        const gain = (fp - s.position.costBasis) * s.position.shares;
        const gainPct = ((fp - s.position.costBasis) / s.position.costBasis) * 100;
        s.completedTrades.push({
          id: order.id,
          direction: 'long',
          entryPrice: s.position.costBasis,
          exitPrice: fp,
          shares: s.position.shares,
          gainDollar: Math.round(gain * 100) / 100,
          gainPercent: Math.round(gainPct * 100) / 100,
          entryBar: 0,
          exitBar: s.revealedBars,
        });
        s.position = createEmptyPosition();
      } else {
        s.position = {
          type: 'short',
          shares: order.shares,
          costBasis: fp,
          stopPrice: null,
          unrealizedPL: 0,
        };
      }
    }
  }

  s.pendingOrders = s.pendingOrders.filter(o => o.status === 'pending');
}

function updatePositionPL(s: BattleState): void {
  if (!s.position.type || s.revealedBars <= 0) return;
  const price = s.candles[s.revealedBars - 1]?.close ?? 0;
  if (s.position.type === 'long') {
    s.position.unrealizedPL = Math.round((price - s.position.costBasis) * s.position.shares * 100) / 100;
  } else {
    s.position.unrealizedPL = Math.round((s.position.costBasis - price) * s.position.shares * 100) / 100;
  }
}

// ─── Actions ────────────────────────────────────────────────

let _roundTimer: ReturnType<typeof setInterval> | null = null;
let _autoBarTimer: ReturnType<typeof setInterval> | null = null;

function clearRoundTimer(): void {
  if (_roundTimer) {
    clearInterval(_roundTimer);
    _roundTimer = null;
  }
}

function clearAutoBarTimer(): void {
  if (_autoBarTimer) {
    clearInterval(_autoBarTimer);
    _autoBarTimer = null;
  }
}

function startAutoBarTimer(): void {
  clearAutoBarTimer();
  _autoBarTimer = setInterval(() => {
    const s = get(battleStore);
    if (s.phase !== 'playing') {
      clearAutoBarTimer();
      return;
    }
    // Auto-advance bars when position is open
    if (s.position.type) {
      revealNextBar();
    }
  }, 1500); // 1.5 seconds per bar when in position
}

function startRoundTimer(): void {
  clearRoundTimer();
  startAutoBarTimer(); // Start auto-bar alongside round timer
  _roundTimer = setInterval(() => {
    battleStore.update(s => {
      if (s.phase !== 'playing') {
        clearRoundTimer();
        clearAutoBarTimer();
        return s;
      }
      s.roundTimer = Math.max(0, s.roundTimer - 1);
      if (s.roundTimer <= 0) {
        clearRoundTimer();
        clearAutoBarTimer();
        return handleRoundEnd(s);
      }
      return { ...s };
    });
  }, 1000);
}

export function setSymbol(sym: string): void {
  battleStore.update(s => ({
    ...s,
    selectedSymbol: sym,
  }));
}

export async function startBattle(): Promise<void> {
  const todayCount = getTodayBattleCount();
  if (todayCount >= DAILY_BATTLE_LIMIT) {
    battleStore.update(s => ({
      ...s,
      dailyLimitReached: true,
      todayCount,
    }));
    return;
  }

  // Set loading state
  battleStore.update(s => ({
    ...s,
    phase: 'loading' as BattlePhase,
    todayCount,
  }));

  const currentState = get(battleStore);
  const symbol = currentState.selectedSymbol;

  let candles: Candle[];
  let era: EraInfo;

  try {
    const result = await fetchHistoricalCandles(symbol);
    candles = result.candles;
    era = result.era;
  } catch (err) {
    console.warn('[Battle] Binance fetch failed, using mock data:', err);
    candles = generateMockCandles(TOTAL_BARS);
    era = {
      symbol,
      startDate: 'Unknown',
      endDate: 'Unknown',
      timeframe: '15m',
    };
  }

  // Generate AI decisions for all 3 rounds
  const roundDecisions: RoundDecision[] = [];
  for (let r = 0; r < 3; r++) {
    const ai = generateAICall(candles, r);
    roundDecisions.push({
      round: r + 1,
      aiCall: ai.call,
      aiConf: 0,
      aiConfTarget: ai.conf,
      aiReason: ai.reason,
      userAgreed: null,
    });
  }

  battleStore.update(s => ({
    ...s,
    phase: 'playing' as BattlePhase,
    candles,
    era,
    revealedBars: HISTORY_BARS, // Start with 30 context bars already visible
    roundNumber: 1 as 1 | 2 | 3,
    roundTimer: ROUND_TIMER_SECONDS,
    position: createEmptyPosition(),
    pendingOrders: [],
    completedTrades: [],
    roundDecisions,
    aiConfidenceProgress: 0,
    resultPnl: 0,
    resultWin: false,
    memoryCard: null,
    todayCount,
  }));

  startRoundTimer();
}

export function revealNextBar(): void {
  battleStore.update(s => {
    if (s.phase !== 'playing') return s;

    const nextReveal = s.revealedBars + 1;
    if (nextReveal > TOTAL_BARS) return s;

    s.revealedBars = nextReveal;

    // Try to fill orders with new candle
    const newCandle = s.candles[nextReveal - 1];
    if (newCandle) {
      tryFillOrders(s, newCandle);
    }

    // Update position P/L
    updatePositionPL(s);

    // Check if round is complete (5 bars per round, offset by HISTORY_BARS)
    const playBarsRevealed = nextReveal - HISTORY_BARS;
    const barsInRound = playBarsRevealed - (s.roundNumber - 1) * BARS_PER_ROUND;
    if (barsInRound >= BARS_PER_ROUND) {
      return handleRoundEnd(s);
    }

    return { ...s };
  });
}

function handleRoundEnd(s: BattleState): BattleState {
  if (s.roundNumber >= 3) {
    clearRoundTimer();
    clearAutoBarTimer();
    return finalizeBattle(s);
  }

  // Move to round break
  s.phase = 'round_break';
  clearRoundTimer();
  clearAutoBarTimer();
  return { ...s };
}

export function advanceRound(): void {
  battleStore.update(s => {
    if (s.phase !== 'round_break') return s;

    const nextRound = (s.roundNumber + 1) as 1 | 2 | 3;
    s.roundNumber = nextRound;
    s.roundTimer = ROUND_TIMER_SECONDS;
    s.phase = 'playing';

    return { ...s };
  });

  startRoundTimer(); // Also restarts autoBarTimer inside
}

export function placeOrder(order: Omit<TradeOrder, 'id' | 'status' | 'filledAt' | 'filledPrice'>): void {
  battleStore.update(s => {
    if (s.phase !== 'playing') return s;

    const newOrder: TradeOrder = {
      ...order,
      id: crypto.randomUUID(),
      status: 'pending',
      filledAt: null,
      filledPrice: null,
    };

    // Market orders fill immediately at current price
    if (newOrder.type === 'market') {
      const price = s.revealedBars > 0
        ? s.candles[s.revealedBars - 1]?.close ?? 0
        : s.candles[0]?.open ?? 0;

      newOrder.status = 'filled';
      newOrder.filledAt = s.revealedBars;
      newOrder.filledPrice = price;

      if (newOrder.action === 'buy') {
        if (s.position.type === 'short') {
          const gain = (s.position.costBasis - price) * s.position.shares;
          const gainPct = ((s.position.costBasis - price) / s.position.costBasis) * 100;
          s.completedTrades.push({
            id: newOrder.id,
            direction: 'short',
            entryPrice: s.position.costBasis,
            exitPrice: price,
            shares: s.position.shares,
            gainDollar: Math.round(gain * 100) / 100,
            gainPercent: Math.round(gainPct * 100) / 100,
            entryBar: 0,
            exitBar: s.revealedBars,
          });
          s.position = createEmptyPosition();
        } else {
          s.position = { type: 'long', shares: newOrder.shares, costBasis: price, stopPrice: null, unrealizedPL: 0 };
        }
      } else {
        if (s.position.type === 'long') {
          const gain = (price - s.position.costBasis) * s.position.shares;
          const gainPct = ((price - s.position.costBasis) / s.position.costBasis) * 100;
          s.completedTrades.push({
            id: newOrder.id,
            direction: 'long',
            entryPrice: s.position.costBasis,
            exitPrice: price,
            shares: s.position.shares,
            gainDollar: Math.round(gain * 100) / 100,
            gainPercent: Math.round(gainPct * 100) / 100,
            entryBar: 0,
            exitBar: s.revealedBars,
          });
          s.position = createEmptyPosition();
        } else {
          s.position = { type: 'short', shares: newOrder.shares, costBasis: price, stopPrice: null, unrealizedPL: 0 };
        }
      }
    } else {
      s.pendingOrders = [...s.pendingOrders, newOrder];
    }

    return { ...s };
  });
}

export function cancelOrder(orderId: string): void {
  battleStore.update(s => {
    s.pendingOrders = s.pendingOrders.map(o =>
      o.id === orderId ? { ...o, status: 'cancelled' as OrderStatus } : o
    ).filter(o => o.status === 'pending');
    return { ...s };
  });
}

function finalizeBattle(s: BattleState): BattleState {
  s.phase = 'result';
  clearRoundTimer();

  // Force-close any open position at last revealed candle price
  if (s.position.type && s.revealedBars > 0) {
    const lastPrice = s.candles[s.revealedBars - 1]?.close ?? 0;
    const dir = s.position.type;
    const gain = dir === 'long'
      ? (lastPrice - s.position.costBasis) * s.position.shares
      : (s.position.costBasis - lastPrice) * s.position.shares;
    const gainPct = dir === 'long'
      ? ((lastPrice - s.position.costBasis) / s.position.costBasis) * 100
      : ((s.position.costBasis - lastPrice) / s.position.costBasis) * 100;
    s.completedTrades.push({
      id: crypto.randomUUID(),
      direction: dir,
      entryPrice: s.position.costBasis,
      exitPrice: lastPrice,
      shares: s.position.shares,
      gainDollar: Math.round(gain * 100) / 100,
      gainPercent: Math.round(gainPct * 100) / 100,
      entryBar: 0,
      exitBar: s.revealedBars,
    });
    s.position = createEmptyPosition();
  }

  // Calculate total PnL from all completed trades
  const totalPnlValue = s.completedTrades.reduce((sum, t) => sum + t.gainDollar, 0);
  s.resultPnl = Math.round(totalPnlValue * 100) / 100;
  s.resultWin = totalPnlValue > 0;
  s.memoryCard = MEMORY_CARDS[Math.floor(Math.random() * MEMORY_CARDS.length)];

  // Save battle record
  const agentId = (typeof window !== 'undefined' && localStorage.getItem('cogochi_primary_agent')) || 'structure';
  const resultStr: 'win' | 'loss' = s.resultWin ? 'win' : 'loss';

  addBattleRecord({
    result: resultStr,
    pnl: s.resultPnl,
    era: `${s.era.symbol} ${s.era.startDate}`,
    agentId,
    decisions: s.completedTrades.length,
    correctRate: s.completedTrades.length > 0
      ? Math.round((s.completedTrades.filter(t => t.gainDollar > 0).length / s.completedTrades.length) * 100)
      : 0,
  });

  recordAgentMatch(agentId, {
    matchN: s.battleNumber,
    dir: s.resultWin ? 'LONG' : 'SHORT',
    conf: Math.round(s.resultPnl * 10),
    win: s.resultWin,
    lp: Math.round(s.resultPnl * 10),
  });

  if (s.memoryCard) {
    const card: MemoryCard = {
      id: crypto.randomUUID(),
      agentId,
      title: `${s.era.symbol}: ${s.memoryCard}`,
      lesson: s.resultWin
        ? 'Profitable trade in historical market conditions'
        : 'Loss teaches discipline and pattern recognition',
      regime: 'range',
      era: `${s.era.symbol} ${s.era.startDate}-${s.era.endDate}`,
      result: resultStr,
      createdAt: Date.now(),
    };
    addMemoryCard(card);
  }

  return { ...s };
}

export function endGameEarly(): void {
  battleStore.update(s => {
    if (s.phase !== 'playing' && s.phase !== 'round_break') return s;
    return finalizeBattle({ ...s });
  });
}

export function resetBattle(): void {
  clearRoundTimer();
  battleStore.set(createInitialState());
}

export function nextBattle(): void {
  clearRoundTimer();
  const todayCount = getTodayBattleCount();
  if (todayCount >= DAILY_BATTLE_LIMIT) {
    battleStore.update(s => ({
      ...s,
      phase: 'ready' as BattlePhase,
      dailyLimitReached: true,
      todayCount,
    }));
    return;
  }

  battleStore.set({
    ...createInitialState(),
    battleNumber: todayCount + 1,
    todayCount,
    dailyLimitReached: false,
  });
}

// ─── Exports for constants ──────────────────────────────────

export { TOTAL_BARS, BARS_PER_ROUND, DEFAULT_SHARES, ROUND_TIMER_SECONDS };
