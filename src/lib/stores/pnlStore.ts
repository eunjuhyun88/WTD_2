// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — PnL Tracking Store (localStorage persisted)
// Tracks profit/loss from Arena battles and Polymarket predictions
// ═══════════════════════════════════════════════════════════════

import { writable, derived } from 'svelte/store';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';

export interface PnLEntry {
  id: string;
  source: 'arena' | 'predict';
  sourceId: string;       // matchId or marketId
  pnl: number;
  timestamp: number;
  details: string;
}

interface PnLState {
  entries: PnLEntry[];
}

const MAX_ENTRIES = 500;

export const pnlStore = writable<PnLState>(
  loadFromStorage<PnLState>(STORAGE_KEYS.pnl, { entries: [] })
);

autoSave(pnlStore, STORAGE_KEYS.pnl);

// Derived stores
export const pnlEntries = derived(pnlStore, $s => $s.entries);

export const totalPnL = derived(pnlStore, $s =>
  $s.entries.reduce((sum, e) => sum + e.pnl, 0)
);

export const arenaPnL = derived(pnlStore, $s =>
  $s.entries.filter(e => e.source === 'arena').reduce((sum, e) => sum + e.pnl, 0)
);

export const predictPnL = derived(pnlStore, $s =>
  $s.entries.filter(e => e.source === 'predict').reduce((sum, e) => sum + e.pnl, 0)
);

export function pnlByDay(): Record<string, number> {
  let entries: PnLEntry[] = [];
  const unsub = pnlStore.subscribe(s => { entries = s.entries; });
  unsub();

  const byDay: Record<string, number> = {};
  for (const e of entries) {
    const day = new Date(e.timestamp).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + e.pnl;
  }
  return byDay;
}

export function pnlBySource(): { arena: number; predict: number } {
  let entries: PnLEntry[] = [];
  const unsub = pnlStore.subscribe(s => { entries = s.entries; });
  unsub();

  let arena = 0;
  let predict = 0;
  for (const e of entries) {
    if (e.source === 'arena') arena += e.pnl;
    else predict += e.pnl;
  }
  return { arena, predict };
}

export function addPnLEntry(source: 'arena' | 'predict', sourceId: string, pnl: number, details: string) {
  pnlStore.update(s => ({
    entries: [
      { id: crypto.randomUUID(), source, sourceId, pnl, timestamp: Date.now(), details },
      ...s.entries
    ].slice(0, MAX_ENTRIES)
  }));
}
