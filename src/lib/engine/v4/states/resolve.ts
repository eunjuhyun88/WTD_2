// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: RESOLVE (Cumulative PnL)
// Real trading: track multiple trades, cumulative PnL decides match
// The chart IS the whale — price going against you = losing
// Design: BattleStateMachine_20260322 § STATE 6
// ═══════════════════════════════════════════════════════════════

import type {
  BattleTickState,
  BattleOutcome,
  MatchResult,
  BattleEvent,
  Position,
  PositionAction,
  TradeHistory,
  StageFrame,
  MarketFrame,
  ScenarioFrame,
  OwnedAgent,
} from '../types.js';
import { V4_CONFIG } from '../types.js';

// ─── Main entry ────────────────────────────────────────────────

export function resolve(state: BattleTickState): BattleTickState {
  const { position, positionAction, market, stage, scenario, squad } = state;
  let tradeHistory = { ...state.tradeHistory };

  if (!market) {
    return { ...state, state: 'REFLECT' };
  }

  // 1. Handle closed/flipped positions → record trade
  let currentPosition = position;
  let outcome: BattleOutcome = 'NEUTRAL';
  const events: BattleEvent[] = [];

  if (currentPosition && currentPosition.status === 'CLOSED') {
    // Record the closed trade
    const pnl = currentPosition.pnlPercent ?? 0;
    tradeHistory = recordTrade(tradeHistory, currentPosition);

    outcome = pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'NEUTRAL';

    events.push({
      type: pnl > 0 ? 'ZONE_CAPTURED' : 'ZONE_LOST',
      detail: `${currentPosition.direction} ${pnl > 0 ? '+' : ''}${(pnl * 100).toFixed(2)}% | Total: ${(tradeHistory.totalPnl * 100).toFixed(2)}%`,
      tick: state.tick,
    });

    // If FLIP, open new position in opposite direction
    if (positionAction === 'FLIP') {
      const newDir = currentPosition.direction === 'LONG' ? 'SHORT' as const : 'LONG' as const;
      currentPosition = {
        direction: newDir,
        entryPrice: market.price,
        entryTick: state.tick,
        size: V4_CONFIG.POSITION_SIZE,
        status: 'OPEN',
        unrealizedPnl: 0,
      };
    } else {
      currentPosition = undefined; // Position fully closed
    }
  }

  // 2. Update unrealized PnL for open position
  if (currentPosition && currentPosition.status === 'OPEN') {
    const unrealized = currentPosition.direction === 'LONG'
      ? (market.price - currentPosition.entryPrice) / currentPosition.entryPrice
      : (currentPosition.entryPrice - market.price) / currentPosition.entryPrice;
    currentPosition = { ...currentPosition, unrealizedPnl: unrealized };

    // Track unrealized PnL in tradeHistory for match completion check
    tradeHistory = { ...tradeHistory, unrealizedPnl: unrealized };

    // Determine tick outcome from unrealized direction
    if (outcome === 'NEUTRAL') {
      outcome = unrealized > 0.001 ? 'WIN' : unrealized < -0.001 ? 'LOSS' : 'NEUTRAL';
    }
  } else {
    tradeHistory = { ...tradeHistory, unrealizedPnl: 0 };
  }

  // 3. Update stage based on cumulative PnL
  const updatedStage = updateStage(stage, tradeHistory, outcome, state.tick, events);

  // 4. Update squad HP based on PnL
  const updatedSquad = updateSquadHP(squad, tradeHistory, outcome, currentPosition);

  // 5. XP
  const xpGained = outcome === 'WIN' ? 10 : outcome === 'LOSS' ? 3 : 1;

  // 6. Check match completion
  const matchResult = checkMatchCompletion(tradeHistory, updatedStage, scenario, updatedSquad);

  return {
    ...state,
    state: 'REFLECT',
    position: currentPosition,
    tradeHistory,
    outcome,
    matchResult,
    stage: updatedStage,
    squad: updatedSquad,
    events: [...state.events, ...events],
    xpGained,
  };
}

// ─── Record a closed trade ─────────────────────────────────────

function recordTrade(history: TradeHistory, closedPosition: Position): TradeHistory {
  const pnl = closedPosition.pnlPercent ?? 0;
  return {
    trades: [...history.trades, closedPosition],
    totalPnl: history.totalPnl + pnl,
    tradeCount: history.tradeCount + 1,
    winCount: history.winCount + (pnl > 0 ? 1 : 0),
    lossCount: history.lossCount + (pnl < 0 ? 1 : 0),
  };
}

// ─── Update stage from cumulative PnL ──────────────────────────

function updateStage(
  stage: StageFrame,
  tradeHistory: TradeHistory,
  outcome: BattleOutcome,
  tick: number,
  events: BattleEvent[],
): StageFrame {
  const updatedStage: StageFrame = {
    ...stage,
    capturedZones: [...stage.capturedZones],
    predatorZones: [...stage.predatorZones],
    tick,
  };

  // Zone control = cumulative realized PnL (direct mapping)
  // +5% PnL → 0.5 zone control, +10% → 1.0 (win target)
  updatedStage.zoneControlScore = tradeHistory.totalPnl / V4_CONFIG.PROFIT_TARGET_PERCENT;

  // Capture zones based on cumulative PnL milestones
  const zones = ['ZONE_1', 'ZONE_2', 'ZONE_3', 'ZONE_4'];
  const pnlPercent = tradeHistory.totalPnl * 100;
  const zonesEarned = Math.floor(Math.max(0, pnlPercent) / 2.5); // 1 zone per 2.5% profit
  updatedStage.capturedZones = zones.slice(0, Math.min(zonesEarned, zones.length));

  return updatedStage;
}

// ─── Update squad HP ───────────────────────────────────────────

function updateSquadHP(
  squad: OwnedAgent[],
  tradeHistory: TradeHistory,
  outcome: BattleOutcome,
  currentPosition: Position | undefined,
): OwnedAgent[] {
  return squad.map(a => {
    const record = { ...a.record };

    // HP = 1.0 - (negative cumulative PnL scaled)
    // At -15% drawdown → HP = 0
    const drawdown = Math.max(0, -tradeHistory.totalPnl);
    const hpFromPnl = Math.max(0, 1 - drawdown / V4_CONFIG.MAX_DRAWDOWN_PERCENT);

    // Unrealized loss also pressures HP slightly
    const unrealizedPressure = currentPosition?.unrealizedPnl
      ? Math.max(0, -currentPosition.unrealizedPnl * 0.3)
      : 0;

    record.currentHealth = Math.max(0, hpFromPnl - unrealizedPressure);

    // Track wins/losses per tick
    if (outcome === 'WIN') {
      record.wins += 1;
      record.currentStreak = Math.max(0, record.currentStreak) + 1;
    } else if (outcome === 'LOSS') {
      record.losses += 1;
      record.currentStreak = Math.min(0, record.currentStreak) - 1;
    }
    record.totalBattles = tradeHistory.tradeCount;
    record.xp += outcome === 'WIN' ? 10 : outcome === 'LOSS' ? 3 : 1;

    return { ...a, record };
  });
}

// ─── Match completion check ────────────────────────────────────

function checkMatchCompletion(
  tradeHistory: TradeHistory,
  stage: StageFrame,
  scenario: ScenarioFrame,
  squad: OwnedAgent[],
): MatchResult | undefined {
  // Early WIN: cumulative PnL reaches profit target
  if (tradeHistory.totalPnl >= V4_CONFIG.PROFIT_TARGET_PERCENT) {
    return 'WIN';
  }

  // Early LOSS: cumulative PnL exceeds max drawdown
  if (tradeHistory.totalPnl <= -V4_CONFIG.MAX_DRAWDOWN_PERCENT) {
    return 'LOSS';
  }

  // HP depletion
  const allDead = squad.every(a => a.record.currentHealth <= 0);
  if (allDead) return 'LOSS';

  // Tick limit reached → judge by cumulative PnL + unrealized PnL
  if (stage.tick >= scenario.tickLimit) {
    // Include unrealized PnL from open position in final judgment
    const openPnl = tradeHistory.unrealizedPnl ?? 0;
    const effectivePnl = tradeHistory.totalPnl + openPnl;
    if (effectivePnl > 0.005) return 'WIN';   // +0.5%+ = win
    if (effectivePnl < -0.005) return 'LOSS';  // -0.5%+ = loss
    return 'DRAW';
  }

  return undefined;
}
