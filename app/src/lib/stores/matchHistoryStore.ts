// ═══════════════════════════════════════════════════════════════
// WTD — Match History Store (localStorage persisted)
// ═══════════════════════════════════════════════════════════════

import { writable, derived } from 'svelte/store';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';
import { createMatchApi, fetchMatchesApi, type ApiMatchRecord } from '$lib/api/matchesApi';

export interface MatchRecord {
  id: string;
  matchN: number;
  timestamp: number;
  win: boolean;
  lp: number;
  score: number;
  streak: number;

  // Squad details
  agents: string[];             // agent IDs
  agentVotes: Array<{
    agentId: string;
    name: string;
    icon: string;
    color: string;
    dir: string;
    conf: number;
  }>;

  // Hypothesis
  hypothesis: {
    dir: string;
    conf: number;
    tf: string;
    entry: number;
    tp: number;
    sl: number;
    rr: number;
  } | null;

  // Result details
  battleResult: string | null;
  consensusType: string | null;
  lpMult: number;

  // Signals summary
  signals: string[];
}

interface MatchHistoryState {
  records: MatchRecord[];
}

const MAX_RECORDS = 100;
let _matchHistoryHydrated = false;
let _matchHistoryHydratePromise: Promise<void> | null = null;

export const matchHistoryStore = writable<MatchHistoryState>(
  loadFromStorage<MatchHistoryState>(STORAGE_KEYS.matchHistory, { records: [] })
);

autoSave(matchHistoryStore, STORAGE_KEYS.matchHistory, undefined, 500);

// Derived stores
export const matchRecords = derived(matchHistoryStore, $s => $s.records);
export const winRate = derived(matchHistoryStore, $s => {
  if ($s.records.length === 0) return 0;
  return Math.round(($s.records.filter(r => r.win).length / $s.records.length) * 100);
});
export const avgLP = derived(matchHistoryStore, $s => {
  if ($s.records.length === 0) return 0;
  return Math.round($s.records.reduce((sum, r) => sum + r.lp, 0) / $s.records.length);
});
export const bestStreak = derived(matchHistoryStore, $s => {
  let best = 0;
  let cur = 0;
  for (const r of $s.records) {
    if (r.win) { cur++; if (cur > best) best = cur; }
    else { cur = 0; }
  }
  return best;
});

function mapApiMatch(row: ApiMatchRecord): MatchRecord {
  return {
    id: row.id,
    matchN: Number(row.matchN),
    timestamp: Number(row.createdAt),
    win: Boolean(row.win),
    lp: Number(row.lp ?? 0),
    score: Number(row.score ?? 0),
    streak: Number(row.streak ?? 0),
    agents: Array.isArray(row.agents) ? row.agents : [],
    agentVotes: Array.isArray(row.agentVotes) ? row.agentVotes : [],
    hypothesis: row.hypothesis ?? null,
    battleResult: row.battleResult ?? null,
    consensusType: row.consensusType ?? null,
    lpMult: Number(row.lpMult ?? 1),
    signals: Array.isArray(row.signals) ? row.signals : [],
  };
}

function mergeServerAndLocalRecords(serverRecords: MatchRecord[], localRecords: MatchRecord[]): MatchRecord[] {
  const serverIds = new Set(serverRecords.map((r) => r.id));
  const unsyncedLocal = localRecords.filter((r) => !serverIds.has(r.id));
  return [...serverRecords, ...unsyncedLocal]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECORDS);
}

export async function hydrateMatchHistory(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (_matchHistoryHydrated && !force) return;
  if (_matchHistoryHydratePromise) return _matchHistoryHydratePromise;

  _matchHistoryHydratePromise = (async () => {
    const records = await fetchMatchesApi({ limit: MAX_RECORDS, offset: 0 });
    if (!records) return;

    matchHistoryStore.update((s) => ({
      records: mergeServerAndLocalRecords(records.map(mapApiMatch), s.records)
    }));

    _matchHistoryHydrated = true;
  })();

  try {
    await _matchHistoryHydratePromise;
  } finally {
    _matchHistoryHydratePromise = null;
  }
}

function replaceLocalMatchRecord(localId: string, record: MatchRecord) {
  matchHistoryStore.update((s) => ({
    records: s.records.map((r) => (r.id === localId ? record : r))
  }));
}

export function addMatchRecord(record: Omit<MatchRecord, 'id' | 'timestamp'>, sync: boolean = true) {
  const localId = crypto.randomUUID();
  const localRecord: MatchRecord = { ...record, id: localId, timestamp: Date.now() };

  matchHistoryStore.update(s => ({
    records: [localRecord, ...s.records].slice(0, MAX_RECORDS)
  }));

  if (sync && typeof window !== 'undefined') {
    void createMatchApi({
      matchN: localRecord.matchN,
      win: localRecord.win,
      lp: localRecord.lp,
      score: localRecord.score,
      streak: localRecord.streak,
      agents: localRecord.agents,
      agentVotes: localRecord.agentVotes,
      hypothesis: localRecord.hypothesis,
      battleResult: localRecord.battleResult,
      consensusType: localRecord.consensusType,
      lpMult: localRecord.lpMult,
      signals: localRecord.signals,
    }).then((serverRecord) => {
      if (!serverRecord) return;
      replaceLocalMatchRecord(localId, mapApiMatch(serverRecord));
    });
  }

  return localId;
}

// ─── Sprint A2: Simple battle record for CHATBATTLE mode ────

export interface BattleRecord {
  id: string;
  timestamp: number;
  result: 'win' | 'loss';
  pnl: number;
  era: string;
  agentId: string;
  decisions: number;
  correctRate: number;
}

const BATTLE_RECORDS_KEY = 'cogochi_battle_records';

function loadBattleRecords(): BattleRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BATTLE_RECORDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const battleRecords = writable<BattleRecord[]>(loadBattleRecords());

battleRecords.subscribe((records) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BATTLE_RECORDS_KEY, JSON.stringify(records));
  } catch { /* ignore quota errors */ }
});

export function addBattleRecord(record: Omit<BattleRecord, 'id' | 'timestamp'>): BattleRecord {
  const full: BattleRecord = {
    ...record,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  battleRecords.update((recs) => [full, ...recs].slice(0, 200));
  return full;
}

export function getTodayBattleCount(): number {
  let count = 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const ts = todayStart.getTime();

  const recs = loadBattleRecords();
  for (const r of recs) {
    if (r.timestamp >= ts) count++;
  }
  return count;
}

// 자동 hydration은 hydrateDomainStores() 단일 진입점에서 수행한다.
