// ═══════════════════════════════════════════════════════════════
// WTD — QuickTrade Store (Terminal 퀵 트레이드)
// Terminal에서의 독립적인 LONG/SHORT 포지션 트래킹
// Arena와 완전 분리 — 빠른 시그널 기반 트레이딩
// ═══════════════════════════════════════════════════════════════

import { writable, derived, get } from 'svelte/store';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';
import {
  closeQuickTradeApi,
  fetchQuickTradesApi,
  openQuickTradeApi,
  updateQuickTradePricesApi,
  type ApiQuickTrade,
} from '$lib/api/tradingApi';
import { buildPriceMapHash, getBaseSymbolFromPair, toNumericPriceMap, type PriceLikeMap } from '$lib/utils/price';

export type TradeDirection = 'LONG' | 'SHORT';
export type TradeStatus = 'open' | 'closed' | 'stopped';

export interface QuickTrade {
  id: string;
  pair: string;
  dir: TradeDirection;
  entry: number;
  tp: number | null;       // take profit (optional)
  sl: number | null;       // stop loss (optional)
  currentPrice: number;
  pnlPercent: number;
  status: TradeStatus;
  openedAt: number;
  closedAt: number | null;
  closePnl: number | null; // final PnL when closed
  source: string;          // 'manual' | agent name
  note: string;
}

interface QuickTradeState {
  trades: QuickTrade[];
  showPanel: boolean;      // toggle trade panel visibility
}

const MAX_TRADES = 200;
const PRICE_SYNC_DEBOUNCE_MS = 1200;
let _quickTradesHydrated = false;
let _quickTradesHydratePromise: Promise<void> | null = null;

const loaded = loadFromStorage<{ trades: QuickTrade[] }>(STORAGE_KEYS.quickTrades, { trades: [] });
export const quickTradeStore = writable<QuickTradeState>({ trades: loaded.trades, showPanel: false });

autoSave(quickTradeStore, STORAGE_KEYS.quickTrades, (s) => ({ trades: s.trades }), 400);

// ═══ Derived ═══
export const openTrades = derived(quickTradeStore, $s =>
  $s.trades.filter(t => t.status === 'open')
);

export const closedTrades = derived(quickTradeStore, $s =>
  $s.trades.filter(t => t.status !== 'open')
);

export const totalQuickPnL = derived(quickTradeStore, $s =>
  $s.trades
    .filter(t => t.closePnl !== null)
    .reduce((sum, t) => sum + (t.closePnl || 0), 0)
);

export const openTradeCount = derived(quickTradeStore, $s =>
  $s.trades.filter(t => t.status === 'open').length
);

function mapApiQuickTrade(row: ApiQuickTrade): QuickTrade {
  return {
    id: row.id,
    pair: row.pair,
    dir: row.dir,
    entry: Number(row.entry),
    tp: row.tp == null ? null : Number(row.tp),
    sl: row.sl == null ? null : Number(row.sl),
    currentPrice: Number(row.currentPrice),
    pnlPercent: Number(row.pnlPercent ?? 0),
    status: row.status,
    openedAt: Number(row.openedAt),
    closedAt: row.closedAt == null ? null : Number(row.closedAt),
    closePnl: row.closePnl == null ? null : Number(row.closePnl),
    source: row.source || 'manual',
    note: row.note || '',
  };
}

function mergeServerAndLocalTrades(serverTrades: QuickTrade[], localTrades: QuickTrade[]): QuickTrade[] {
  const serverIds = new Set(serverTrades.map((t) => t.id));
  const unsyncedLocal = localTrades.filter((t) => !serverIds.has(t.id));
  return [...serverTrades, ...unsyncedLocal]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, MAX_TRADES);
}

export async function hydrateQuickTrades(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (_quickTradesHydrated && !force) return;
  if (_quickTradesHydratePromise) return _quickTradesHydratePromise;

  _quickTradesHydratePromise = (async () => {
    const records = await fetchQuickTradesApi({ limit: MAX_TRADES, offset: 0 });
    if (!records) return;

    quickTradeStore.update((s) => ({
      ...s,
      trades: mergeServerAndLocalTrades(records.map(mapApiQuickTrade), s.trades),
    }));

    _quickTradesHydrated = true;
  })();

  try {
    await _quickTradesHydratePromise;
  } finally {
    _quickTradesHydratePromise = null;
  }
}

// ═══ Actions ═══

export function replaceQuickTradeId(localId: string, nextId: string, patch: Partial<QuickTrade> = {}) {
  quickTradeStore.update(s => ({
    ...s,
    trades: s.trades.map(t => (t.id === localId ? { ...t, id: nextId, ...patch } : t))
  }));
}

export function openQuickTrade(
  pair: string,
  dir: TradeDirection,
  entry: number,
  tp: number | null = null,
  sl: number | null = null,
  source: string = 'manual',
  note: string = '',
  sync: boolean = true
) {
  const localId = crypto.randomUUID();
  const trade: QuickTrade = {
    id: localId,
    pair,
    dir,
    entry,
    tp,
    sl,
    currentPrice: entry,
    pnlPercent: 0,
    status: 'open',
    openedAt: Date.now(),
    closedAt: null,
    closePnl: null,
    source,
    note
  };

  quickTradeStore.update(s => ({
    ...s,
    trades: [trade, ...s.trades].slice(0, MAX_TRADES),
    showPanel: true
  }));

  if (sync && typeof window !== 'undefined') {
    void openQuickTradeApi({
      pair: trade.pair,
      dir: trade.dir,
      entry: trade.entry,
      tp: trade.tp,
      sl: trade.sl,
      currentPrice: trade.currentPrice,
      source: trade.source,
      note: trade.note,
    }).then((serverTrade) => {
      if (!serverTrade || !serverTrade.id) return;
      replaceQuickTradeId(localId, serverTrade.id, {
        currentPrice: serverTrade.currentPrice,
        pnlPercent: serverTrade.pnlPercent,
        status: serverTrade.status,
        openedAt: serverTrade.openedAt,
      });
    });
  }

  return trade.id;
}

export function closeQuickTrade(tradeId: string, exitPrice: number) {
  quickTradeStore.update(s => ({
    ...s,
    trades: s.trades.map(t => {
      if (t.id !== tradeId || t.status !== 'open') return t;
      const pnl = t.dir === 'LONG'
        ? +((exitPrice - t.entry) / t.entry * 100).toFixed(2)
        : +((t.entry - exitPrice) / t.entry * 100).toFixed(2);
      return {
        ...t,
        status: 'closed' as TradeStatus,
        currentPrice: exitPrice,
        pnlPercent: pnl,
        closePnl: pnl,
        closedAt: Date.now()
      };
    })
  }));

  if (typeof window !== 'undefined') {
    void closeQuickTradeApi(tradeId, { closePrice: exitPrice, status: 'closed' }).then((serverTrade) => {
      if (!serverTrade) return;
      quickTradeStore.update(s => ({
        ...s,
        trades: s.trades.map(t => {
          if (t.id !== tradeId && t.id !== serverTrade.id) return t;
          return {
            ...t,
            id: serverTrade.id,
            currentPrice: serverTrade.currentPrice,
            pnlPercent: serverTrade.pnlPercent,
            status: serverTrade.status,
            closedAt: serverTrade.closedAt,
            closePnl: serverTrade.closePnl,
          };
        }),
      }));
    });
  }
}

export function updateTradePrice(tradeId: string, currentPrice: number) {
  quickTradeStore.update(s => ({
    ...s,
    trades: s.trades.map(t => {
      if (t.id !== tradeId || t.status !== 'open') return t;
      const pnl = t.dir === 'LONG'
        ? +((currentPrice - t.entry) / t.entry * 100).toFixed(2)
        : +((t.entry - currentPrice) / t.entry * 100).toFixed(2);
      return { ...t, currentPrice, pnlPercent: pnl };
    })
  }));
}

let _lastLocalPriceSnapshot = '';
let _lastOpenTradeHash = '';
let _lastServerSyncSnapshot = '';
let _priceSyncTimer: ReturnType<typeof setTimeout> | null = null;
export function updateAllPrices(
  priceInput: PriceLikeMap,
  options: { syncServer?: boolean } = {}
) {
  const syncServer = options.syncServer ?? true;

  const state = get(quickTradeStore);
  const openIds = state.trades.filter((t) => t.status === 'open').map((t) => t.id);
  const hasOpenTrades = openIds.length > 0;
  const openTradeHash = openIds.join('|');
  if (!hasOpenTrades) {
    _lastOpenTradeHash = '';
    _lastServerSyncSnapshot = '';
    return;
  }

  const prices = toNumericPriceMap(priceInput);
  const snap = buildPriceMapHash(prices);

  // Skip only when both prices and open-trade set are unchanged.
  // This prevents missing updates when a new trade opens at the same price snapshot.
  if (!(snap === _lastLocalPriceSnapshot && openTradeHash === _lastOpenTradeHash)) {
    let changed = false;
    const trades = state.trades.map((t) => {
      if (t.status !== 'open') return t;
      const token = getBaseSymbolFromPair(t.pair);
      const price = prices[token];
      if (!price || price === t.currentPrice) return t;
      changed = true;
      const pnl = t.dir === 'LONG'
        ? +((price - t.entry) / t.entry * 100).toFixed(2)
        : +((t.entry - price) / t.entry * 100).toFixed(2);
      return { ...t, currentPrice: price, pnlPercent: pnl };
    });

    if (changed) {
      quickTradeStore.set({
        ...state,
        trades,
      });
    }
  }

  _lastLocalPriceSnapshot = snap;
  _lastOpenTradeHash = openTradeHash;

  if (syncServer && typeof window !== 'undefined') {
    const serverSyncHash = `${snap}::${openTradeHash}`;
    if (serverSyncHash === _lastServerSyncSnapshot) return;
    _lastServerSyncSnapshot = serverSyncHash;

    const payload = { ...prices };
    if (_priceSyncTimer) clearTimeout(_priceSyncTimer);
    _priceSyncTimer = setTimeout(() => {
      void updateQuickTradePricesApi({ prices: payload }).catch(() => {
        // allow retry on next sync tick if request failed
        _lastServerSyncSnapshot = '';
      });
    }, PRICE_SYNC_DEBOUNCE_MS);
  }
}

export function toggleTradePanel() {
  quickTradeStore.update(s => ({ ...s, showPanel: !s.showPanel }));
}

export function clearClosedTrades() {
  quickTradeStore.update(s => ({
    ...s,
    trades: s.trades.filter(t => t.status === 'open')
  }));
}

// 모듈 import 시 자동 hydration 제거 — terminal 페이지 onMount에서 호출하도록 변경
// 모든 페이지에서 불필요한 API 호출 방지
// if (typeof window !== 'undefined') { void hydrateQuickTrades(); }
