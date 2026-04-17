// ═══════════════════════════════════════════════════════════════
// COGOCHI — Trade Pattern Analyzer
// Analyzes imported trade history → trading profile → doctrine pre-fill
// Design: Cogochi_SystemDesign § 3 (Builder path Step 2)
// ═══════════════════════════════════════════════════════════════

import { query } from '$lib/server/db.js';
import type { ArchetypeId } from '$lib/contracts/researchV4';

// ─── Types ─────────────────────────────────────────────────────

export interface TradeProfile {
  totalTrades: number;
  longRatio: number;          // 0~1
  shortRatio: number;         // 0~1
  avgHoldTimeHours: number;
  winRate: number;             // 0~1
  avgWinPnl: number;
  avgLossPnl: number;
  maxDrawdown: number;
  profitFactor: number;       // total profit / total loss
  riskRewardRatio: number;
  mostTradedSymbol: string;
  tradingHours: number[];     // 0-23 distribution
  suggestedArchetype: ArchetypeId;
  suggestedSignalWeights: {
    cvdDivergence: number;
    fundingRate: number;
    openInterest: number;
    htfStructure: number;
  };
  summary: string;
}

interface DBTrade {
  side: string;
  price: number;
  quantity: number;
  realized_pnl: number;
  trade_time: Date;
  symbol: string;
}

// ─── Analyze trades for a user ─────────────────────────────────

export async function analyzeTradePattern(
  userId: string,
): Promise<{ profile: TradeProfile | null; error?: string }> {
  try {
    const result = await query<DBTrade>(
      `SELECT side, price, quantity, realized_pnl, trade_time, symbol
       FROM imported_trades
       WHERE user_id = $1
       ORDER BY trade_time ASC`,
      [userId],
    );

    if (result.rows.length < 10) {
      return { profile: null, error: `Need at least 10 trades, found ${result.rows.length}` };
    }

    const trades = result.rows;
    const profile = computeProfile(trades);
    return { profile };
  } catch (err: any) {
    return { profile: null, error: err?.message };
  }
}

// ─── Profile computation ───────────────────────────────────────

function computeProfile(trades: DBTrade[]): TradeProfile {
  const total = trades.length;

  // Long/Short ratio
  const longs = trades.filter(t => t.side === 'BUY').length;
  const longRatio = longs / total;
  const shortRatio = 1 - longRatio;

  // Win/Loss
  const wins = trades.filter(t => t.realized_pnl > 0);
  const losses = trades.filter(t => t.realized_pnl < 0);
  const winRate = wins.length / Math.max(1, wins.length + losses.length);

  const avgWinPnl = wins.length > 0
    ? wins.reduce((s, t) => s + t.realized_pnl, 0) / wins.length
    : 0;
  const avgLossPnl = losses.length > 0
    ? Math.abs(losses.reduce((s, t) => s + t.realized_pnl, 0) / losses.length)
    : 0;

  const totalProfit = wins.reduce((s, t) => s + t.realized_pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.realized_pnl, 0));
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 999 : 0;
  const riskRewardRatio = avgLossPnl > 0 ? avgWinPnl / avgLossPnl : 0;

  // Hold time (approximate: gap between sequential trades)
  const holdTimes: number[] = [];
  for (let i = 1; i < trades.length; i++) {
    const diff = new Date(trades[i].trade_time).getTime() - new Date(trades[i - 1].trade_time).getTime();
    if (diff > 0 && diff < 7 * 24 * 3600 * 1000) { // cap at 7 days
      holdTimes.push(diff / (3600 * 1000));
    }
  }
  const avgHoldTimeHours = holdTimes.length > 0
    ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length
    : 0;

  // Max drawdown (cumulative PnL)
  let cumPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of trades) {
    cumPnl += t.realized_pnl;
    peak = Math.max(peak, cumPnl);
    maxDrawdown = Math.max(maxDrawdown, peak - cumPnl);
  }

  // Most traded symbol
  const symbolCounts: Record<string, number> = {};
  for (const t of trades) {
    symbolCounts[t.symbol] = (symbolCounts[t.symbol] ?? 0) + 1;
  }
  const mostTradedSymbol = Object.entries(symbolCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'BTCUSDT';

  // Trading hours distribution
  const tradingHours = new Array(24).fill(0);
  for (const t of trades) {
    const hour = new Date(t.trade_time).getUTCHours();
    tradingHours[hour]++;
  }

  // Suggest archetype
  const suggestedArchetype = suggestArchetype(shortRatio, avgHoldTimeHours, winRate, riskRewardRatio);

  // Suggest signal weights
  const suggestedSignalWeights = suggestWeights(suggestedArchetype, shortRatio);

  // Summary
  const summary = buildSummary(total, longRatio, winRate, avgHoldTimeHours, suggestedArchetype);

  return {
    totalTrades: total,
    longRatio,
    shortRatio,
    avgHoldTimeHours,
    winRate,
    avgWinPnl,
    avgLossPnl,
    maxDrawdown,
    profitFactor,
    riskRewardRatio,
    mostTradedSymbol,
    tradingHours,
    suggestedArchetype,
    suggestedSignalWeights,
    summary,
  };
}

// ─── Archetype suggestion ──────────────────────────────────────

function suggestArchetype(
  shortRatio: number,
  avgHoldHours: number,
  winRate: number,
  rrRatio: number,
): ArchetypeId {
  // CRUSHER: short-heavy, aggressive
  if (shortRatio > 0.6 && avgHoldHours < 8) return 'CRUSHER';

  // RIDER: momentum follower, moderate hold time
  if (avgHoldHours > 4 && avgHoldHours < 48 && winRate > 0.5) return 'RIDER';

  // ORACLE: low win rate but high R:R (divergence hunter)
  if (winRate < 0.45 && rrRatio > 2.0) return 'ORACLE';

  // GUARDIAN: conservative, long hold, high win rate
  if (winRate > 0.6 && avgHoldHours > 12) return 'GUARDIAN';

  // Default based on bias
  return shortRatio > 0.5 ? 'CRUSHER' : 'RIDER';
}

function suggestWeights(
  archetype: ArchetypeId,
  shortRatio: number,
): TradeProfile['suggestedSignalWeights'] {
  const weights: Record<ArchetypeId, TradeProfile['suggestedSignalWeights']> = {
    CRUSHER: { cvdDivergence: 0.8, fundingRate: 0.7, openInterest: 0.6, htfStructure: 0.4 },
    RIDER:   { cvdDivergence: 0.5, fundingRate: 0.4, openInterest: 0.5, htfStructure: 0.8 },
    ORACLE:  { cvdDivergence: 0.9, fundingRate: 0.6, openInterest: 0.7, htfStructure: 0.5 },
    GUARDIAN: { cvdDivergence: 0.6, fundingRate: 0.8, openInterest: 0.6, htfStructure: 0.7 },
  };
  return weights[archetype];
}

function buildSummary(
  total: number,
  longRatio: number,
  winRate: number,
  holdHours: number,
  archetype: ArchetypeId,
): string {
  const bias = longRatio > 0.6 ? 'long-biased' : longRatio < 0.4 ? 'short-biased' : 'balanced';
  const style = holdHours < 4 ? 'scalper' : holdHours < 24 ? 'swing trader' : 'position trader';
  return `${total} trades analyzed. ${bias} ${style} with ${(winRate * 100).toFixed(0)}% win rate. Suggested: ${archetype}`;
}
