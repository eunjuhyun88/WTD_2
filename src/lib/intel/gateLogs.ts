import type { GateVisibility, QualityGateScores } from './types';

export interface GateLogEntry {
  id: string;
  createdAt: number;
  source: string;
  visibility: GateVisibility;
  weightedScore: number;
  blockers: string[];
  scores: QualityGateScores;
}

const MAX_LOG_ENTRIES = 500;
const gateLogs: GateLogEntry[] = [];

function createId(): string {
  return `gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function recordGateLog(entry: Omit<GateLogEntry, 'id' | 'createdAt'>): GateLogEntry {
  const record: GateLogEntry = {
    id: createId(),
    createdAt: Date.now(),
    ...entry,
  };

  gateLogs.unshift(record);
  if (gateLogs.length > MAX_LOG_ENTRIES) gateLogs.length = MAX_LOG_ENTRIES;
  return record;
}

export function listGateLogs(limit = 50): GateLogEntry[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), MAX_LOG_ENTRIES)) : 50;
  return gateLogs.slice(0, safeLimit).map((item) => ({
    ...item,
    blockers: [...item.blockers],
    scores: { ...item.scores },
  }));
}

export function clearGateLogs(): void {
  gateLogs.length = 0;
}
