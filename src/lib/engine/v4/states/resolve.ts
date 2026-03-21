// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State: RESOLVE
// Applies GameActionPlan against market outcome.
// Updates Zone/HP/XP. Checks match completion.
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
} from '../types.js';
import { V4_CONFIG } from '../types.js';

// ─── Main entry ────────────────────────────────────────────────

export function resolve(state: BattleTickState): BattleTickState {
  const { plan, stage, market, scenario, squad } = state;

  if (!plan || !market) {
    return { ...state, state: 'REFLECT' };
  }

  // 1. Calculate base power
  const agentLevel = squad[0]?.level ?? 1;
  const memoriesLoaded = Object.values(state.memoriesByAgent ?? {})
    .reduce((sum, mems) => sum + mems.length, 0);
  const memoryMultiplier = Math.min(memoriesLoaded * 0.05, 1.0);
  const basePower = plan.power * agentLevel * (1 + memoryMultiplier);

  // 2. Determine outcome by comparing action direction with market
  const outcome = determineOutcome(plan, market);

  // 3. Update stage (zones, HP, etc.)
  const { updatedStage, updatedSquad, events, xpGained } = applyOutcome(
    outcome,
    plan,
    stage,
    market,
    squad,
    basePower,
    state.tick,
  );

  // 4. Check match completion
  const matchResult = checkMatchCompletion(
    updatedStage,
    scenario,
    updatedSquad,
  );

  return {
    ...state,
    state: 'REFLECT',
    outcome,
    matchResult,
    stage: updatedStage,
    squad: updatedSquad,
    events: [...state.events, ...events],
    xpGained,
  };
}

// ─── Outcome determination ─────────────────────────────────────

function determineOutcome(plan: GameActionPlan, market: MarketFrame): BattleOutcome {
  // HOLD = always NEUTRAL
  if (plan.primary === 'HOLD' || plan.primary === 'DEFEND') {
    return 'NEUTRAL';
  }

  const priceDir = market.priceDelta > 0 ? 'UP' : market.priceDelta < 0 ? 'DOWN' : 'FLAT';

  const actionDir =
    ['LONG_PUSH', 'BREAK_WALL'].includes(plan.primary) ? 'UP'
    : ['SHORT_SLAM', 'CRUSH_SUPPORT', 'LAY_TRAP'].includes(plan.primary) ? 'DOWN'
    : 'FLAT';

  if (actionDir === 'FLAT') return 'NEUTRAL';
  if (actionDir === priceDir) return 'WIN';
  if (Math.abs(market.priceDelta) < V4_CONFIG.NEUTRAL_PRICE_THRESHOLD) return 'NEUTRAL';
  return 'LOSS';
}

// ─── Apply outcome to game state ───────────────────────────────

function applyOutcome(
  outcome: BattleOutcome,
  plan: GameActionPlan,
  stage: StageFrame,
  market: MarketFrame,
  squad: OwnedAgent[],
  basePower: number,
  tick: number,
): {
  updatedStage: StageFrame;
  updatedSquad: OwnedAgent[];
  events: BattleEvent[];
  xpGained: number;
} {
  const events: BattleEvent[] = [];
  let xpGained = 0;

  // Clone stage
  const updatedStage: StageFrame = {
    ...stage,
    capturedZones: [...stage.capturedZones],
    predatorZones: [...stage.predatorZones],
  };

  // Clone squad (update records)
  const updatedSquad = squad.map(a => ({
    ...a,
    record: { ...a.record },
  }));

  // Apply stage power multiplier
  const stageMultiplier = V4_CONFIG.STAGE_POWER_MULTIPLIER[squad[0]?.stage ?? 0] ?? 0.6;
  const effectivePower = basePower * stageMultiplier;

  if (outcome === 'WIN') {
    // Capture zone
    if (plan.targetZone && !updatedStage.capturedZones.includes(plan.targetZone)) {
      updatedStage.capturedZones.push(plan.targetZone);
      events.push({ type: 'ZONE_CAPTURED', detail: plan.targetZone, tick });
    }
    updatedStage.zoneControlScore += effectivePower * 0.1;
    xpGained = Math.round(effectivePower * 10);

    // Update all agent records
    for (const agent of updatedSquad) {
      agent.record.wins += 1;
      agent.record.currentStreak = Math.max(0, agent.record.currentStreak) + 1;
      agent.record.xp += xpGained;
    }
  }

  if (outcome === 'LOSS') {
    // Lose zone
    if (plan.targetZone && updatedStage.capturedZones.includes(plan.targetZone)) {
      updatedStage.capturedZones = updatedStage.capturedZones.filter(z => z !== plan.targetZone);
      events.push({ type: 'ZONE_LOST', detail: plan.targetZone, tick });
    }

    // HP damage to all agents
    const hpDamage = effectivePower * 0.05;
    for (const agent of updatedSquad) {
      agent.record.currentHealth = Math.max(0, agent.record.currentHealth - hpDamage);
      agent.record.losses += 1;
      agent.record.currentStreak = Math.min(0, agent.record.currentStreak) - 1;

      if (agent.record.currentHealth < 0.15) {
        events.push({ type: 'HEALTH_CRITICAL', agentId: agent.id, tick });
      }
    }

    // Predator trap check
    const caughtInTrap = updatedStage.predatorZones.some(z =>
      z.active && plan.targetZone && z.id.includes(plan.targetZone)
    );
    if (caughtInTrap) {
      const trapDamage = 0.20;
      for (const agent of updatedSquad) {
        agent.record.currentHealth = Math.max(0, agent.record.currentHealth - trapDamage);
      }
      events.push({ type: 'TRAP_CAUGHT', tick });
    }

    xpGained = Math.round(effectivePower * 3); // Less XP for losses, but still some
  }

  if (outcome === 'NEUTRAL') {
    xpGained = 1; // Minimal XP for holding
  }

  // Update total battles
  for (const agent of updatedSquad) {
    agent.record.totalBattles += 1;
  }

  // Clamp zone control score
  updatedStage.zoneControlScore = Math.max(0, Math.min(1, updatedStage.zoneControlScore));

  return { updatedStage, updatedSquad, events, xpGained };
}

// ─── Match completion check ────────────────────────────────────

function checkMatchCompletion(
  stage: StageFrame,
  scenario: ScenarioFrame,
  squad: OwnedAgent[],
): MatchResult | undefined {
  // Win: zone control score exceeds objective threshold
  if (stage.zoneControlScore >= scenario.objectiveThreshold) {
    return 'WIN';
  }

  // Loss: all agents health depleted
  const allDead = squad.every(a => a.record.currentHealth <= 0);
  if (allDead) {
    return 'LOSS';
  }

  // Tick limit reached
  if (stage.tick >= scenario.tickLimit) {
    return stage.zoneControlScore > 0.3 ? 'DRAW' : 'LOSS';
  }

  // Not yet complete
  return undefined;
}
