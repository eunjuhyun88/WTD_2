// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — localStorage DB CRUD Layer
// Generic table-based localStorage persistence
// ═══════════════════════════════════════════════════════════════

import { STORAGE_KEYS } from './storageKeys';

export interface DBRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface DBTable<T extends DBRecord> {
  getAll: () => T[];
  getById: (id: string) => T | undefined;
  query: (predicate: (item: T) => boolean) => T[];
  create: (data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>) => T;
  update: (id: string, data: Partial<T>) => T | undefined;
  remove: (id: string) => boolean;
  count: () => number;
  clear: () => void;
}

export function createTable<T extends DBRecord>(
  tableName: string,
  maxRecords: number = 500
): DBTable<T> {
  const keyMap: Record<string, string> = {
    users: STORAGE_KEYS.dbUsers,
    matches: STORAGE_KEYS.dbMatches,
    signals: STORAGE_KEYS.dbSignals,
    predictions: STORAGE_KEYS.dbPredictions,
  };
  const key = keyMap[tableName] || `stockclaw_${tableName}`;

  function load(): T[] {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  }

  function save(records: T[]) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(records));
    } catch (e) {
      console.warn(`[dbStore] Failed to save ${tableName}:`, e);
    }
  }

  function getAll(): T[] {
    return load();
  }

  function getById(id: string): T | undefined {
    return load().find(r => r.id === id);
  }

  function query(predicate: (item: T) => boolean): T[] {
    return load().filter(predicate);
  }

  function create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T {
    const records = load();
    const now = Date.now();
    const record = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    } as T;

    records.unshift(record);

    // Auto-prune: remove oldest records if over limit
    if (records.length > maxRecords) {
      records.length = maxRecords;
    }

    save(records);
    return record;
  }

  function update(id: string, data: Partial<T>): T | undefined {
    const records = load();
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return undefined;

    records[idx] = { ...records[idx], ...data, updatedAt: Date.now() };
    save(records);
    return records[idx];
  }

  function remove(id: string): boolean {
    const records = load();
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return false;

    records.splice(idx, 1);
    save(records);
    return true;
  }

  function count(): number {
    return load().length;
  }

  function clear(): void {
    save([]);
  }

  return { getAll, getById, query, create, update, remove, count, clear };
}

// ═══ Pre-defined Tables ═══

export interface UserRecord extends DBRecord {
  email: string;
  nickname: string;
  walletAddress: string | null;
  walletSignature: string | null;
  tier: string;
  matchesPlayed: number;
  totalLP: number;
}

export interface MatchDBRecord extends DBRecord {
  userId: string | null;
  matchN: number;
  win: boolean;
  lp: number;
  score: number;
  agents: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hypothesis: any;
  battleResult: string | null;
  consensusType: string | null;
}

export interface SignalRecord extends DBRecord {
  userId: string | null;
  pair: string;
  dir: string;
  source: string;        // 'war_room' | 'arena' | 'manual'
  tracked: boolean;
  resolved: boolean;
  pnl: number | null;
}

export interface PredictionRecord extends DBRecord {
  userId: string | null;
  marketId: string;
  marketTitle: string;
  direction: string;     // 'YES' | 'NO'
  entryOdds: number;
  amount: number;
  settled: boolean;
  pnl: number | null;
}

// Create table instances
export const usersTable = createTable<UserRecord>('users', 100);
export const matchesTable = createTable<MatchDBRecord>('matches', 500);
export const signalsTable = createTable<SignalRecord>('signals', 500);
export const predictionsTable = createTable<PredictionRecord>('predictions', 500);
