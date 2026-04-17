import {
  createDefaultSquad as createEngineDefaultSquad,
  runFullBattle as runEngineFullBattle,
} from '$lib/engine/v4/battleStateMachine.js';
import type {
  ArchetypeId,
  BattleScenario,
  BattleTickState,
  OwnedAgent,
} from '$lib/contracts/researchV4';

export function createDefaultSquad(
  userId: string,
  prefix: string,
  archetype: ArchetypeId,
): OwnedAgent[] {
  return createEngineDefaultSquad(userId, prefix, archetype) as unknown as OwnedAgent[];
}

export async function runFullBattle(
  scenario: BattleScenario,
  squad: OwnedAgent[],
  options: {
    totalRounds: number;
    objectiveThreshold: number;
    tickLimit: number;
  },
): Promise<BattleTickState> {
  return runEngineFullBattle(
    scenario as never,
    squad as never,
    options,
  ) as unknown as BattleTickState;
}
