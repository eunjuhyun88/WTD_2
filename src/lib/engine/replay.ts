// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Match Replay Engine
// Replays recorded match data through the phase system
// ═══════════════════════════════════════════════════════════════

import type { MatchRecord } from '$lib/stores/matchHistoryStore';

export interface ReplayData {
  matchId: string;
  matchN: number;
  agents: string[];
  agentVotes: MatchRecord['agentVotes'];
  hypothesis: MatchRecord['hypothesis'];
  battleResult: string | null;
  consensusType: string | null;
  win: boolean;
  lp: number;
}

export interface ReplayState {
  active: boolean;
  data: ReplayData | null;
  currentStep: number;
  totalSteps: number;
  paused: boolean;
}

// Replay step definitions
export type ReplayStep =
  | { type: 'deploy'; agents: string[] }
  | { type: 'hypothesis'; hypothesis: ReplayData['hypothesis'] }
  | { type: 'preview'; hypothesis: ReplayData['hypothesis'] }
  | { type: 'scout'; agentVotes: ReplayData['agentVotes'] }
  | { type: 'council'; agentVotes: ReplayData['agentVotes'] }
  | { type: 'verdict'; consensusType: string | null }
  | { type: 'battle'; battleResult: string | null }
  | { type: 'result'; win: boolean; lp: number };

export function generateReplaySteps(data: ReplayData): ReplayStep[] {
  const steps: ReplayStep[] = [
    { type: 'deploy', agents: data.agents },
    { type: 'hypothesis', hypothesis: data.hypothesis },
    { type: 'preview', hypothesis: data.hypothesis },
    { type: 'scout', agentVotes: data.agentVotes },
    { type: 'council', agentVotes: data.agentVotes },
    { type: 'verdict', consensusType: data.consensusType },
    { type: 'battle', battleResult: data.battleResult },
    { type: 'result', win: data.win, lp: data.lp }
  ];
  return steps;
}

export function matchRecordToReplayData(record: MatchRecord): ReplayData {
  return {
    matchId: record.id,
    matchN: record.matchN,
    agents: record.agents,
    agentVotes: record.agentVotes,
    hypothesis: record.hypothesis,
    battleResult: record.battleResult,
    consensusType: record.consensusType,
    win: record.win,
    lp: record.lp
  };
}

// Create default replay state
export function createReplayState(): ReplayState {
  return {
    active: false,
    data: null,
    currentStep: 0,
    totalSteps: 0,
    paused: false
  };
}
