// ═══════════════════════════════════════════════════════════════
// WTD — Tracked Signal Store
// WarRoom TRACK 버튼 → 시그널 추적 → TRACKED 탭에 표시
// 24h 자동 만료, QuickTrade로 전환 가능
// ═══════════════════════════════════════════════════════════════

import { writable, derived, get } from 'svelte/store';
import { openQuickTrade, replaceQuickTradeId, type TradeDirection } from './quickTradeStore';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';
import { convertSignalApi, fetchTrackedSignalsApi, trackSignalApi, type ApiTrackedSignal, untrackSignalApi } from '$lib/api/tradingApi';
import { buildPriceMapHash, getBaseSymbolFromPair, toNumericPriceMap, type PriceLikeMap } from '$lib/utils/price';

export type SignalStatus = 'tracking' | 'expired' | 'converted';

export interface TrackedSignal {
  id: string;
  pair: string;
  dir: 'LONG' | 'SHORT';
  source: string;           // agent name or 'manual'
  confidence: number;
  trackedAt: number;
  currentPrice: number;
  entryPrice: number;
  pnlPercent: number;
  status: SignalStatus;
  expiresAt: number;        // timestamp: 24h from trackedAt
  note: string;
}

interface TrackedSignalState {
  signals: TrackedSignal[];
}

const MAX_SIGNALS = 50;
const EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 hours
let _trackedSignalsHydrated = false;
let _trackedSignalsHydratePromise: Promise<void> | null = null;

function loadState(): TrackedSignalState {
  const raw = loadFromStorage<{ signals: TrackedSignal[] }>(STORAGE_KEYS.trackedSignals, { signals: [] });
  const now = Date.now();
  return {
    signals: raw.signals.map((signal) => {
      if (signal.status === 'tracking' && signal.expiresAt < now) {
        return { ...signal, status: 'expired' as SignalStatus };
      }
      return signal;
    }),
  };
}

export const trackedSignalStore = writable<TrackedSignalState>(loadState());

autoSave(trackedSignalStore, STORAGE_KEYS.trackedSignals, undefined, 400);

// ═══ Derived ═══

export const activeSignals = derived(trackedSignalStore, $s =>
  $s.signals.filter(s => s.status === 'tracking')
);

export const expiredSignals = derived(trackedSignalStore, $s =>
  $s.signals.filter(s => s.status === 'expired')
);

export const convertedSignals = derived(trackedSignalStore, $s =>
  $s.signals.filter(s => s.status === 'converted')
);

export const activeSignalCount = derived(trackedSignalStore, $s =>
  $s.signals.filter(s => s.status === 'tracking').length
);

function mapApiTrackedSignal(row: ApiTrackedSignal): TrackedSignal {
  return {
    id: row.id,
    pair: row.pair,
    dir: row.dir,
    source: row.source || 'manual',
    confidence: Number(row.confidence ?? 0),
    trackedAt: Number(row.trackedAt),
    currentPrice: Number(row.currentPrice),
    entryPrice: Number(row.entryPrice),
    pnlPercent: Number(row.pnlPercent ?? 0),
    status: row.status,
    expiresAt: Number(row.expiresAt),
    note: row.note || '',
  };
}

function mergeServerAndLocalSignals(serverSignals: TrackedSignal[], localSignals: TrackedSignal[]): TrackedSignal[] {
  const serverIds = new Set(serverSignals.map((s) => s.id));
  const unsyncedLocal = localSignals.filter((s) => !serverIds.has(s.id));
  return [...serverSignals, ...unsyncedLocal]
    .sort((a, b) => b.trackedAt - a.trackedAt)
    .slice(0, MAX_SIGNALS);
}

export async function hydrateTrackedSignals(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (_trackedSignalsHydrated && !force) return;
  if (_trackedSignalsHydratePromise) return _trackedSignalsHydratePromise;

  _trackedSignalsHydratePromise = (async () => {
    const records = await fetchTrackedSignalsApi({ limit: MAX_SIGNALS, offset: 0 });
    if (!records) return;

    trackedSignalStore.update((s) => ({
      signals: mergeServerAndLocalSignals(records.map(mapApiTrackedSignal), s.signals)
    }));

    _trackedSignalsHydrated = true;
  })();

  try {
    await _trackedSignalsHydratePromise;
  } finally {
    _trackedSignalsHydratePromise = null;
  }
}

// ═══ Actions ═══

export function replaceTrackedSignalId(localId: string, nextId: string, patch: Partial<TrackedSignal> = {}) {
  trackedSignalStore.update(s => ({
    signals: s.signals.map(sig => (sig.id === localId ? { ...sig, id: nextId, ...patch } : sig))
  }));
}

export function trackSignal(
  pair: string,
  dir: 'LONG' | 'SHORT',
  entryPrice: number,
  source: string = 'manual',
  confidence: number = 75,
  note: string = '',
  sync: boolean = true
): string {
  const localId = crypto.randomUUID();
  const signal: TrackedSignal = {
    id: localId,
    pair,
    dir,
    source,
    confidence,
    trackedAt: Date.now(),
    currentPrice: entryPrice,
    entryPrice,
    pnlPercent: 0,
    status: 'tracking',
    expiresAt: Date.now() + EXPIRE_MS,
    note,
  };

  trackedSignalStore.update(s => ({
    signals: [signal, ...s.signals].slice(0, MAX_SIGNALS)
  }));

  if (sync && typeof window !== 'undefined') {
    void trackSignalApi({
      pair: signal.pair,
      dir: signal.dir,
      confidence: signal.confidence,
      entryPrice: signal.entryPrice,
      currentPrice: signal.currentPrice,
      source: signal.source,
      note: signal.note,
      ttlHours: 24,
    }).then((serverSignal) => {
      if (!serverSignal || !serverSignal.id) return;
      replaceTrackedSignalId(localId, serverSignal.id, {
        confidence: serverSignal.confidence,
        currentPrice: serverSignal.currentPrice,
        pnlPercent: serverSignal.pnlPercent,
        status: serverSignal.status,
        trackedAt: serverSignal.trackedAt,
        expiresAt: serverSignal.expiresAt,
      });
    });
  }

  return signal.id;
}

export function removeTracked(signalId: string) {
  trackedSignalStore.update(s => ({
    signals: s.signals.filter(sig => sig.id !== signalId)
  }));

  if (typeof window !== 'undefined') {
    void untrackSignalApi(signalId);
  }
}

export function convertToTrade(signalId: string, currentPrice: number): string | null {
  let tradeId: string | null = null;
  let targetSignal: TrackedSignal | null = null;

  trackedSignalStore.update(s => ({
    signals: s.signals.map(sig => {
      if (sig.id !== signalId || sig.status !== 'tracking') return sig;
      targetSignal = sig;

      // Open a QuickTrade with this signal's data
      tradeId = openQuickTrade(
        sig.pair,
        sig.dir as TradeDirection,
        currentPrice,
        null, null,
        `tracked:${sig.source}`,
        sig.note,
        false
      );

      return { ...sig, status: 'converted' as SignalStatus };
    })
  }));

  if (typeof window !== 'undefined' && targetSignal && tradeId) {
    void convertSignalApi(signalId, {
      entry: currentPrice,
      note: (targetSignal as TrackedSignal).note,
    }).then((serverTrade) => {
      if (!serverTrade || !serverTrade.id) return;
      replaceQuickTradeId(tradeId as string, serverTrade.id, {
        currentPrice: serverTrade.currentPrice,
        pnlPercent: serverTrade.pnlPercent,
        status: serverTrade.status,
        openedAt: serverTrade.openedAt,
      });
    });
  }

  return tradeId;
}

let _lastTrackedPriceSnap = '';
export function updateTrackedPrices(priceInput: PriceLikeMap) {
  const state = get(trackedSignalStore);
  const hasTracking = state.signals.some((sig) => sig.status === 'tracking');
  if (!hasTracking) return;
  const now = Date.now();
  const hasExpired = state.signals.some((sig) => sig.status === 'tracking' && sig.expiresAt < now);

  const prices = toNumericPriceMap(priceInput);
  const snap = buildPriceMapHash(prices);
  if (!hasExpired && snap === _lastTrackedPriceSnap) return;
  _lastTrackedPriceSnap = snap;

  let changed = false;
  const signals = state.signals.map((sig) => {
    if (sig.status === 'tracking' && sig.expiresAt < now) {
      changed = true;
      return { ...sig, status: 'expired' as SignalStatus };
    }
    if (sig.status !== 'tracking') return sig;

    const token = getBaseSymbolFromPair(sig.pair);
    const price = prices[token];
    if (!price || price === sig.currentPrice) return sig;

    changed = true;
    const pnl = sig.dir === 'LONG'
      ? +((price - sig.entryPrice) / sig.entryPrice * 100).toFixed(2)
      : +((sig.entryPrice - price) / sig.entryPrice * 100).toFixed(2);

    return { ...sig, currentPrice: price, pnlPercent: pnl };
  });

  if (changed) {
    trackedSignalStore.set({ signals });
  }
}

export function clearExpired() {
  trackedSignalStore.update(s => ({
    signals: s.signals.filter(sig => sig.status === 'tracking')
  }));
}

export function clearAll() {
  trackedSignalStore.update(() => ({ signals: [] }));
}

// 자동 hydration은 hydrateDomainStores() 단일 진입점에서 수행한다.
