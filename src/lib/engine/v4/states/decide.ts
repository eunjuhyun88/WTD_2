// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: DECIDE
// Compiles SquadConsensus into GameActionPlan (Battle Grammar)
// Processes player intervention (APPROVE/OVERRIDE)
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
  TrainerLabel,
} from '../types.js';

// ─── Main entry ────────────────────────────────────────────────

export function decide(state: BattleTickState): BattleTickState {
  const { consensus, stage, market, playerIntervention } = state;

  if (!consensus || !market) {
    return {
      ...state,
      state: 'RESOLVE',
      plan: {
        primary: 'HOLD',
        power: 0,
        trainerLabel: null,
      },
    };
  }

  // 1. Compile consensus to GameActionPlan
  let plan = compileToGameAction(consensus, stage, market);

  // 2. Process player intervention
  if (playerIntervention) {
    plan = applyPlayerIntervention(plan, playerIntervention, consensus);
  }

  return {
    ...state,
    state: 'RESOLVE',
    plan,
  };
}

// ─── Battle Grammar Compiler ───────────────────────────────────

function compileToGameAction(
  consensus: SquadConsensus,
  stage: StageFrame,
  market: MarketFrame,
): GameActionPlan {
  const action = consensus.finalAction;
  const conf = consensus.finalConfidence;

  // LONG actions
  if (action === 'LONG') {
    if (market.volumeImpulse > 0.7 && stage.breakoutGateActive) {
      return {
        primary: 'BREAK_WALL',
        secondary: 'LONG_PUSH',
        power: conf * 1.5,
        targetZone: findNextResistanceZone(stage),
        trainerLabel: null,
      };
    }
    if (market.volumeImpulse > 0.5) {
      return {
        primary: 'LONG_PUSH',
        power: conf,
        targetZone: findNextResistanceZone(stage),
        trainerLabel: null,
      };
    }
    return {
      primary: 'LONG_PUSH',
      power: conf * 0.7,
      trainerLabel: null,
    };
  }

  // SHORT actions
  if (action === 'SHORT') {
    if (stage.supportIntegrity < 0.3) {
      return {
        primary: 'SHORT_SLAM',
        secondary: 'CRUSH_SUPPORT',
        power: conf * 1.3,
        targetZone: findWeakSupportZone(stage),
        trainerLabel: null,
      };
    }
    if (stage.predatorZones.length > 0 && conf > 0.6) {
      return {
        primary: 'LAY_TRAP',
        power: conf,
        trainerLabel: null,
      };
    }
    return {
      primary: 'SHORT_SLAM',
      power: conf,
      trainerLabel: null,
    };
  }

  // FLAT
  return {
    primary: 'HOLD',
    power: 0,
    trainerLabel: null,
  };
}

// ─── Player intervention handler ───────────────────────────────

function applyPlayerIntervention(
  plan: GameActionPlan,
  intervention: PlayerIntervention,
  originalConsensus: SquadConsensus,
): GameActionPlan {
  switch (intervention.type) {
    case 'APPROVE':
      // Keep consensus, mark as trainer-approved
      return {
        ...plan,
        trainerLabel: 'APPROVED',
      };

    case 'OVERRIDE_LONG':
      return overridePlan(plan, 'LONG', 'LONG_PUSH', originalConsensus);

    case 'OVERRIDE_SHORT':
      return overridePlan(plan, 'SHORT', 'SHORT_SLAM', originalConsensus);

    case 'OVERRIDE_FLAT':
      return {
        primary: 'HOLD',
        power: 0,
        trainerLabel: 'OVERRIDDEN',
        originalConsensus,
      };

    default:
      return plan;
  }
}

function overridePlan(
  plan: GameActionPlan,
  _action: BattleAction,
  primary: BattleActionKind,
  originalConsensus: SquadConsensus,
): GameActionPlan {
  return {
    primary,
    power: 0.6, // moderate power for overrides
    trainerLabel: 'OVERRIDDEN',
    originalConsensus,
  };
}

// ─── Zone helpers ──────────────────────────────────────────────

function findNextResistanceZone(stage: StageFrame): string | undefined {
  // Simple: return first uncaptured zone
  const allZones = ['ZONE_1', 'ZONE_2', 'ZONE_3', 'ZONE_4'];
  return allZones.find(z => !stage.capturedZones.includes(z));
}

function findWeakSupportZone(stage: StageFrame): string | undefined {
  // Return the last captured zone (most vulnerable)
  return stage.capturedZones[stage.capturedZones.length - 1];
}
