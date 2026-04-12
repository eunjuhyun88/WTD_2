// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: DECIDE
// Real trading: agent decides OPEN/HOLD/CLOSE/FLIP each tick
// No fixed TP/SL — agent manages position dynamically
// Design: BattleStateMachine_20260322 § STATE 5
// ═══════════════════════════════════════════════════════════════

import type {
  BattleTickState,
  GameActionPlan,
  SquadConsensus,
  StageFrame,
  MarketFrame,
  PlayerIntervention,
  BattleActionKind,
  BattleAction,
  Position,
  PositionAction,
  ClassifyOutput,
} from '../types.js';
import { V4_CONFIG } from '../types.js';

// ─── Main entry ────────────────────────────────────────────────

export function decide(state: BattleTickState): BattleTickState {
  const { consensus, stage, market, playerIntervention, position, classify } = state;

  if (!consensus || !market) {
    return {
      ...state,
      state: 'RESOLVE',
      plan: { primary: 'HOLD', power: 0, trainerLabel: null },
      positionAction: 'HOLD',
    };
  }

  // 1. Compile consensus to GameActionPlan
  let plan = compileToGameAction(consensus, stage, market);

  // 2. Process player intervention
  if (playerIntervention) {
    plan = applyPlayerIntervention(plan, playerIntervention, consensus);
  }

  // 3. Decide position action based on current position + consensus
  const positionAction = decidePositionAction(consensus, position, market);

  // 4. Execute position action
  let newPosition = position;

  switch (positionAction) {
    case 'OPEN_LONG':
      newPosition = createPosition('LONG', market.price, state.tick, classify);
      break;

    case 'OPEN_SHORT':
      newPosition = createPosition('SHORT', market.price, state.tick, classify);
      break;

    case 'HOLD':
      // Keep current position, update unrealized PnL + MFE/MAE (Phase 3)
      if (newPosition && newPosition.status === 'OPEN') {
        const unrealized = calcUnrealizedPnl(newPosition, market.price);
        newPosition = {
          ...newPosition,
          unrealizedPnl: unrealized,
          mfe: Math.max(newPosition.mfe, unrealized),
          mae: Math.min(newPosition.mae, unrealized),
          holdTicks: newPosition.holdTicks + 1,
        };
      }
      break;

    case 'CLOSE':
      // Close current position (resolve will record it + classify failures)
      if (newPosition && newPosition.status === 'OPEN') {
        const pnl = calcUnrealizedPnl(newPosition, market.price);
        const unrealized = pnl;
        // Determine exit type based on why we're closing
        const closeExitType = unrealized <= -V4_CONFIG.AUTO_SL_PERCENT ? 'sl_hit' as const
          : consensus?.finalAction === 'NO_TRADE' ? 'manual' as const
          : consensus?.finalAction === 'FLAT' ? 'manual' as const
          : 'manual' as const;
        newPosition = {
          ...newPosition,
          status: 'CLOSED',
          exitPrice: market.price,
          exitTick: state.tick,
          pnlPercent: pnl,
          unrealizedPnl: pnl,
          mfe: Math.max(newPosition.mfe, unrealized),
          mae: Math.min(newPosition.mae, unrealized),
          holdTicks: newPosition.holdTicks + 1,
          exitType: closeExitType,
        };
      }
      break;

    case 'FLIP':
      // Close current position, then open opposite
      if (newPosition && newPosition.status === 'OPEN') {
        const pnl = calcUnrealizedPnl(newPosition, market.price);
        newPosition = {
          ...newPosition,
          status: 'CLOSED',
          exitPrice: market.price,
          exitTick: state.tick,
          pnlPercent: pnl,
          unrealizedPnl: pnl,
          mfe: Math.max(newPosition.mfe, pnl),
          mae: Math.min(newPosition.mae, pnl),
          holdTicks: newPosition.holdTicks + 1,
          exitType: 'flip',
        };
      }
      break;
  }

  return {
    ...state,
    state: 'RESOLVE',
    plan,
    position: newPosition,
    positionAction,
  };
}

// ─── Position action decision ──────────────────────────────────

function decidePositionAction(
  consensus: SquadConsensus,
  position: Position | undefined,
  market: MarketFrame,
): PositionAction {
  const action = consensus.finalAction;
  const hasPosition = position && position.status === 'OPEN';

  // No position
  if (!hasPosition) {
    if (action === 'NO_TRADE') return 'HOLD'; // Deliberate abstain — don't enter
    if (action === 'LONG') return 'OPEN_LONG';
    if (action === 'SHORT') return 'OPEN_SHORT';
    return 'HOLD'; // FLAT with no position = do nothing
  }

  // Has open position
  const unrealized = calcUnrealizedPnl(position!, market.price);

  // Auto stop-loss: individual position exceeds -5%
  if (unrealized <= -V4_CONFIG.AUTO_SL_PERCENT) {
    return 'CLOSE';
  }

  // Agent says FLAT or NO_TRADE → close position
  if (action === 'FLAT' || action === 'NO_TRADE') {
    return 'CLOSE';
  }

  // Agent agrees with current direction → hold
  if (
    (position!.direction === 'LONG' && action === 'LONG') ||
    (position!.direction === 'SHORT' && action === 'SHORT')
  ) {
    return 'HOLD';
  }

  // Agent wants opposite direction → flip
  return 'FLIP';
}

// ─── Battle Grammar Compiler ───────────────────────────────────

function compileToGameAction(
  consensus: SquadConsensus,
  stage: StageFrame,
  market: MarketFrame,
): GameActionPlan {
  const action = consensus.finalAction;
  const conf = consensus.finalConfidence;

  if (action === 'LONG') {
    if (market.volumeImpulse > 0.7 && stage.breakoutGateActive) {
      return { primary: 'BREAK_WALL', secondary: 'LONG_PUSH', power: conf * 1.5, targetZone: findNextZone(stage), trainerLabel: null };
    }
    return { primary: 'LONG_PUSH', power: conf, targetZone: findNextZone(stage), trainerLabel: null };
  }

  if (action === 'SHORT') {
    if (stage.supportIntegrity < 0.3) {
      return { primary: 'SHORT_SLAM', secondary: 'CRUSH_SUPPORT', power: conf * 1.3, targetZone: findNextZone(stage), trainerLabel: null };
    }
    return { primary: 'SHORT_SLAM', power: conf, trainerLabel: null };
  }

  // NO_TRADE and FLAT both result in HOLD (defensive stance)
  if (action === 'NO_TRADE') {
    return { primary: 'DEFEND', power: 0, trainerLabel: null };
  }

  return { primary: 'HOLD', power: 0, trainerLabel: null };
}

// ─── Player intervention ───────────────────────────────────────

function applyPlayerIntervention(
  plan: GameActionPlan,
  intervention: PlayerIntervention,
  originalConsensus: SquadConsensus,
): GameActionPlan {
  switch (intervention.type) {
    case 'APPROVE':
      return { ...plan, trainerLabel: 'APPROVED' };
    case 'OVERRIDE_LONG':
      return { primary: 'LONG_PUSH', power: 0.6, trainerLabel: 'OVERRIDDEN', originalConsensus };
    case 'OVERRIDE_SHORT':
      return { primary: 'SHORT_SLAM', power: 0.6, trainerLabel: 'OVERRIDDEN', originalConsensus };
    case 'OVERRIDE_FLAT':
      return { primary: 'HOLD', power: 0, trainerLabel: 'OVERRIDDEN', originalConsensus };
    default:
      return plan;
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function createPosition(
  direction: 'LONG' | 'SHORT',
  price: number,
  tick: number,
  classify?: ClassifyOutput,
): Position {
  return {
    direction,
    entryPrice: price,
    entryTick: tick,
    size: V4_CONFIG.POSITION_SIZE,
    status: 'OPEN',
    unrealizedPnl: 0,
    mfe: 0,
    mae: 0,
    holdTicks: 0,
    entryClassify: classify,
  };
}

function calcUnrealizedPnl(position: Position, currentPrice: number): number {
  const entry = position.entryPrice;
  return position.direction === 'LONG'
    ? (currentPrice - entry) / entry
    : (entry - currentPrice) / entry;
}

function findNextZone(stage: StageFrame): string | undefined {
  const zones = ['ZONE_1', 'ZONE_2', 'ZONE_3', 'ZONE_4'];
  return zones.find(z => !stage.capturedZones.includes(z));
}
