import type { AgentSignal } from '$lib/data/warroom';

export type TokenFilter = 'ALL' | string;

export type ScanTab = {
  id: string;
  pair: string;
  timeframe: string;
  token: string;
  createdAt: number;
  label: string;
  signals: AgentSignal[];
};

export type ScanHighlight = {
  agent: string;
  vote: AgentSignal['vote'];
  conf: number;
  note: string;
};

export type SignalDiff = {
  prevVote: AgentSignal['vote'] | null;
  confDelta: number;
  voteChanged: boolean;
  isNew: boolean;
};
