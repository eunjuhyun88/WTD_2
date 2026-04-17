export const BATTLE_XP_REWARDS = {
  WIN: 30,
  LOSS: 10,
  MVP: 20,
  COMBO_5: 5,
  COMBO_8: 10,
  CRITICAL_HIT: 3,
  FINISHER_SUCCESS: 10,
  SIGNATURE_PROC: 15,
  DISSENT_WIN: 25,
  PERFECT_READ: 15,
  GREAT_MATCH: 10,
} as const;

export interface AgentBattleReport {
  agentId: string;
  totalDamage: number;
  totalBlocked: number;
  actionsPerformed: number;
  criticalHits: number;
  findingValidated: boolean | null;
  energyEfficiency: number;
  mvpScore: number;
}

export interface V2BattleResult {
  outcome: 'tp_hit' | 'sl_hit' | 'timeout_win' | 'timeout_loss';
  finalVS: number;
  finalPnL: number;
  maxCombo: number;
  totalTicks: number;
  totalCrits: number;
  agentMVP: string;
  agentReports: AgentBattleReport[];
}
