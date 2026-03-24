// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: RESOLVE (PnL-based)
// Checks position TP/SL against current price.
// Updates HP based on unrealized/realized PnL.
// Zone control = cumulative realized PnL.
// The chart IS the whale — price going against you = losing.
// Design: BattleStateMachine_20260322 § STATE 6
// ═══════════════════════════════════════════════════════════════

import type {
  BattleTickState,
  BattleOutcome,
  MatchResult,
  BattleEvent,
  GameActionPlan,
  StageFrame,
  MarketFrame,
  ScenarioFrame,
  OwnedAgent,
  Position,
} from '../types.js';
import { V4_CONFIG } from '../types.js';

// ─── Main entry ────────────────────────────────────────────────

export function resolve(state: BattleTickState): BattleTickState {
  const { plan, stage, market, scenario, squad, position } = state;

  if (!plan || !market) {
    return { ...state, state: 'REFLECT' };
  }

  // 1. Resolve position against current price
  const { resolvedPosition, outcome, pnlPercent } = resolvePosition(position, market, state.tick);

  // 2. Update stage/HP/XP based on PnL
  const { updatedStage, updatedSquad, events, xpGained } = applyPnLOutcome(
    outcome,
    pnlPercent,
    resolvedPosition,
    plan,
    stage,
    squad,
    state.tick,
  );

  // 3. Check match completion
  const matchResult = checkMatchCompletion(updatedStage, scenario, updatedSquad);

  return {
    ...state,
    state: 'REFLECT',
    position: resolvedPosition,
    outcome,
    matchResult,
    stage: updatedStage,
    squad: updatedSquad,
    events: [...state.events, ...events],
    xpGained,
  };
}

// ─── Position resolution (TP/SL check) ─────────────────────────

function resolvePosition(
  position: Position | undefined,
  market: MarketFrame,
  tick: number,
): { resolvedPosition?: Position; outcome: BattleOutcome; pnlPercent: number } {

  // No position = NEUTRAL (FLAT/HOLD)
  if (!position || position.status !== 'OPEN') {
    return { resolvedPosition: position, outcome: 'NEUTRAL', pnlPercent: 0 };
  }

  const price = market.price;
  const entry = position.entryPrice;
  const isLong = position.direction === 'LONG';

  // Calculate unrealized PnL
  const unrealizedPnl = isLong
    ? (price - entry) / entry
    : (entry - price) / entry;

  // Check Take Profit
  const tpHit = isLong
    ? price >= position.takeProfit
    : price <= position.takeProfit;

  if (tpHit) {
    const realizedPnl = isLong
      ? (position.takeProfit - entry) / entry
      : (entry - position.takeProfit) / entry;

    return {
      resolvedPosition: {
        ...position,
        status: 'TP_HIT',
        exitPrice: position.takeProfit,
        exitTick: tick,
        pnlPercent: realizedPnl,
        unrealizedPnl: realizedPnl,
      },
      outcome: 'WIN',
      pnlPercent: realizedPnl,
    };
  }

  // Check Stop Loss
  const slHit = isLong
    ? price <= position.stopLoss
    : price >= position.stopLoss;

  if (slHit) {
    const realizedPnl = isLong
      ? (position.stopLoss - entry) / entry
      : (entry - position.stopLoss) / entry;

    return {
      resolvedPosition: {
        ...position,
        status: 'SL_HIT',
        exitPrice: position.stopLoss,
        exitTick: tick,
        pnlPercent: realizedPnl,
        unrealizedPnl: realizedPnl,
      },
      outcome: 'LOSS',
      pnlPercent: realizedPnl,
    };
  }

  // Position still open — track unrealized PnL
  return {
    resolvedPosition: {
      ...position,
      unrealizedPnl,
    },
    outcome: 'NEUTRAL', // Not resolved yet
    pnlPercent: unrealizedPnl,
  };
}

// ─── Apply PnL outcome to game state ───────────────────────────

function applyPnLOutcome(
  outcome: BattleOutcome,
  pnlPercent: number,
  position: Position | undefined,
  plan: GameActionPlan,
  stage: StageFrame,
  squad: OwnedAgent[],
  tick: number,
): {
  updatedStage: StageFrame;
  updatedSquad: OwnedAgent[];
  events: BattleEvent[];
  xpGained: number;
} {
  const events: BattleEvent[] = [];
  let xpGained = 0;

  const updatedStage: StageFrame = {
    ...stage,
    capturedZones: [...stage.capturedZones],
    predatorZones: [...stage.predatorZones],
  };

  const updatedSquad = squad.map(a => ({
    ...a,
    record: { ...a.record },
  }));

  // ── TP HIT: realized profit ──
  if (outcome === 'WIN' && position?.status === 'TP_HIT') {
    updatedStage.zoneControlScore += Math.abs(pnlPercent) * 2;

    if (plan.targetZone && !updatedStage.capturedZones.includes(plan.targetZone)) {
      updatedStage.capturedZones.push(plan.targetZone);
      events.push({ type: 'ZONE_CAPTURED', detail: `${plan.targetZone} (+${(pnlPercent * 100).toFixed(2)}%)`, tick });
    }

    for (const agent of updatedSquad) {
      agent.record.currentHealth = Math.min(1, agent.record.currentHealth + Math.abs(pnlPercent) * V4_CONFIG.UNREALIZED_HP_GAIN * 50);
      agent.record.wins += 1;
      agent.record.currentStreak = Math.max(0, agent.record.currentStreak) + 1;
    }

    xpGained = Math.round(Math.abs(pnlPercent) * 1000);
  }

  // ── SL HIT: realized loss ──
  if (outcome === 'LOSS' && position?.status === 'SL_HIT') {
    updatedStage.zoneControlScore -= Math.abs(pnlPercent) * 3;

    if (plan.targetZone && updatedStage.capturedZones.includes(plan.targetZone)) {
      updatedStage.capturedZones = updatedStage.capturedZones.filter(z => z !== plan.targetZone);
      events.push({ type: 'ZONE_LOST', detail: `${plan.targetZone} (${(pnlPercent * 100).toFixed(2)}%)`, tick });
    }

    for (const agent of updatedSquad) {
      agent.record.currentHealth = Math.max(0, agent.record.currentHealth - Math.abs(pnlPercent) * V4_CONFIG.UNREALIZED_HP_LOSS * 50);
      agent.record.losses += 1;
      agent.record.currentStreak = Math.min(0, agent.record.currentStreak) - 1;

      if (agent.record.currentHealth < 0.15) {
        events.push({ type: 'HEALTH_CRITICAL', agentId: agent.id, tick });
      }
    }

    xpGained = Math.round(Math.abs(pnlPercent) * 300);
  }

  // ── NEUTRAL: position still open — unrealized PnL pressure ──
  if (outcome === 'NEUTRAL' && position?.status === 'OPEN' && position.unrealizedPnl !== undefined) {
    const unrealized = position.unrealizedPnl;
    if (unrealized > 0) {
      for (const agent of updatedSquad) {
        agent.record.currentHealth = Math.min(1, agent.record.currentHealth + unrealized * V4_CONFIG.UNREALIZED_HP_GAIN);
      }
    } else {
      for (const agent of updatedSquad) {
        agent.record.currentHealth = Math.max(0, agent.record.currentHealth + unrealized * V4_CONFIG.UNREALIZED_HP_LOSS);
        if (agent.record.currentHealth < 0.15) {
          events.push({ type: 'HEALTH_CRITICAL', agentId: agent.id, tick });
        }
      }
    }
    xpGained = 1;
  }

  // Update total battles (only when position closes or FLAT)
  if (outcome !== 'NEUTRAL' || !position || position.status !== 'OPEN') {
    for (const agent of updatedSquad) {
      agent.record.totalBattles += 1;
    }
  }

  updatedStage.zoneControlScore = Math.max(-0.5, Math.min(1.5, updatedStage.zoneControlScore));

  return { updatedStage, updatedSquad, events, xpGained };
}

// ─── Match completion check ────────────────────────────────────

function checkMatchCompletion(
  stage: StageFrame,
  scenario: ScenarioFrame,
  squad: OwnedAgent[],
): MatchResult | undefined {
  if (stage.zoneControlScore >= scenario.objectiveThreshold) return 'WIN';

  const allDead = squad.every(a => a.record.currentHealth <= 0);
  if (allDead) return 'LOSS';

  if (stage.zoneControlScore < -0.3) return 'LOSS';

  if (stage.tick >= scenario.tickLimit) {
    if (stage.zoneControlScore >= scenario.objectiveThreshold * 0.7) return 'DRAW';
    if (stage.zoneControlScore > 0) return 'DRAW';
    return 'LOSS';
  }

  return undefined;
}
