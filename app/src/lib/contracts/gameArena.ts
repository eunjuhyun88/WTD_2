export type GameDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface FBScore {
  ds: number;
  re: number;
  ci: number;
  fbs: number;
}

export interface OrpoOutput {
  direction: GameDirection;
  confidence: number;
  pattern: string;
  keyLevels: {
    support: number;
    resistance: number;
  };
  factors: unknown[];
  thesis: string;
}

export type CtxAgentId = 'DERIV' | 'FLOW' | 'MACRO' | 'SENTI';
export type CtxFlag = 'RED' | 'GREEN' | 'NEUTRAL';

export interface CtxBelief {
  agentId: CtxAgentId;
  flag: CtxFlag;
  confidence: number;
  headline: string;
  factors: unknown[];
}

export interface CommanderVerdict {
  finalDirection: GameDirection;
  entryScore: number;
  reasoning: string;
  conflictResolved: boolean;
  cost: number;
}

export interface GuardianViolation {
  rule: string;
  detail: string;
  severity: 'BLOCK' | 'WARN';
}

export interface GuardianCheck {
  passed: boolean;
  violations: GuardianViolation[];
  halt: boolean;
}

export interface BattlePriceTick {
  ts: number;
  price: number;
}

export type BattleResult = 'tp' | 'sl' | 'timeout_win' | 'timeout_loss';

export interface BattleTickState {
  status: 'running' | BattleResult;
  currentPrice: number;
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  direction: GameDirection;
  distToTP: number;
  distToSL: number;
  priceHistory: BattlePriceTick[];
  highSinceEntry: number;
  lowSinceEntry: number;
  maxRunup: number;
  maxDrawdown: number;
  elapsed: number;
  duration: number;
  timeProgress: number;
  pnlPercent: number;
  pnlAbsolute: number;
  exitPrice?: number;
  exitTime?: number;
  result?: BattleResult;
  rAchieved?: number;
}

export type WarRoomRound = 1 | 2 | 3;
export type UserInteractionType = 'agree' | 'challenge' | 'question';

export interface WarRoomUserInteraction {
  agentId: string;
  type: UserInteractionType;
  round: WarRoomRound;
}

export interface WarRoomDialogue {
  agentId: string;
  personaName: string;
  text: string;
  direction: GameDirection;
  confidence: number;
  referencedAgent?: string;
}

export interface WarRoomConfidenceShift {
  agentId: string;
  oldConf: number;
  newConf: number;
  reason: string;
}

export interface WarRoomRoundResult {
  round: WarRoomRound;
  dialogues: WarRoomDialogue[];
  confidenceShifts: WarRoomConfidenceShift[];
  userInteractions: WarRoomUserInteraction[];
}

export interface AgentVote {
  mvpAgentId: string | null;
  traitorAgentId: string | null;
}
