import { getLivePriceSnapshot, livePrice, type LivePriceMap } from '$lib/stores/priceStore';
import { updateAllPrices } from '$lib/stores/quickTradeStore';
import { updateTrackedPrices } from '$lib/stores/trackedSignalStore';
import { buildPriceMapHash, toNumericPriceMap } from '$lib/utils/price';

const PERSIST_INTERVAL_VISIBLE_MS = 30_000;
const PERSIST_INTERVAL_HIDDEN_MS = 120_000;

let _started = false;
let _unsubscribe: (() => void) | null = null;
let _persistTimer: ReturnType<typeof setInterval> | null = null;
let _latestSnapshot: LivePriceMap = {};
let _lastPersistHash = '';
let _visibilityHandler: (() => void) | null = null;

function applyLocalSync(snapshot: LivePriceMap): void {
  updateAllPrices(snapshot, { syncServer: false });
  updateTrackedPrices(snapshot);
}

function persistQuickTrades(snapshot: LivePriceMap): void {
  const normalized = toNumericPriceMap(snapshot);
  const hash = buildPriceMapHash(normalized);
  if (!hash || hash === _lastPersistHash) return;

  _lastPersistHash = hash;
  updateAllPrices(snapshot, { syncServer: true });
}

function getPersistIntervalMs(): number {
  if (typeof document === 'undefined') return PERSIST_INTERVAL_VISIBLE_MS;
  return document.visibilityState === 'visible'
    ? PERSIST_INTERVAL_VISIBLE_MS
    : PERSIST_INTERVAL_HIDDEN_MS;
}

function restartPersistTimer(): void {
  if (_persistTimer) {
    clearInterval(_persistTimer);
    _persistTimer = null;
  }

  _persistTimer = setInterval(() => {
    persistQuickTrades(_latestSnapshot);
  }, getPersistIntervalMs());
}

export function ensureLivePriceSyncStarted(): void {
  if (typeof window === 'undefined') return;
  if (_started) return;
  _started = true;

  _latestSnapshot = getLivePriceSnapshot();
  applyLocalSync(_latestSnapshot);

  _unsubscribe = livePrice.subscribe((snapshot) => {
    _latestSnapshot = snapshot;
    applyLocalSync(snapshot);
  });

  restartPersistTimer();

  if (typeof document !== 'undefined') {
    _visibilityHandler = () => {
      restartPersistTimer();
      if (document.visibilityState === 'visible') {
        persistQuickTrades(_latestSnapshot);
      }
    };
    document.addEventListener('visibilitychange', _visibilityHandler);
  }
}

export function stopLivePriceSync(): void {
  if (!_started) return;
  _started = false;

  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  if (_persistTimer) {
    clearInterval(_persistTimer);
    _persistTimer = null;
  }
  if (_visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    _visibilityHandler = null;
  }
}
