// ═══════════════════════════════════════════════════════════════
// WTD — Background Alert Engine (client-side)
// ═══════════════════════════════════════════════════════════════
// Periodically polls the opportunity scan API + onchain alerts,
// detects changes, and fires notifications + toasts.
//
// Onchain alerts (텔레그램 봇 스타일):
//   - MVRV zone transitions (@bitcoin_mvrv)
//   - Whale activity spikes (@BinanceWhaleVolumeAlerts)
//   - Liquidation cascades (@REKTbinance)
//   - Exchange flow surges
//
// Usage: import { alertEngine } from '$lib/services/alertEngine';
//        alertEngine.start();   // called from +layout.svelte or terminal page
//        alertEngine.stop();    // on destroy if needed

import { notifications, toasts } from '$lib/stores/notificationStore';

// ── Types ────────────────────────────────────────────────────

interface AlertCoin {
  symbol: string;
  name: string;
  price: number;
  change1h: number;
  change24h: number;
  totalScore: number;
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  reasons: string[];
  alerts: string[];
}

interface AlertItem {
  symbol: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  score: number;
}

interface ScanSnapshot {
  coins: AlertCoin[];
  alerts: AlertItem[];
  macroRegime: string;
  scannedAt: number;
}

// ── Config ───────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;      // 5 minutes
const MIN_INTERVAL_MS = 2 * 60 * 1000;           // minimum 2 minutes
const SCORE_THRESHOLD_NOTIFY = 65;                // notify for scores ≥ this
const RANK_CHANGE_THRESHOLD = 3;                  // notify if coin jumps ≥ 3 ranks
const PRICE_SPIKE_THRESHOLD_1H = 5;               // % change 1h to trigger spike alert
const NEW_ENTRY_NOTIFY = true;                    // notify when new coin enters top 5
const INIT_JITTER_MAX_MS = 60_000;               // randomize initial delay 30s-90s (prevent thundering herd)
const INTERVAL_JITTER_PCT = 0.15;                // ±15% jitter on each polling interval
const HIDDEN_INTERVAL_MS = 15 * 60 * 1000;       // hidden tab에서는 폴링 빈도 축소

// ── Onchain Alert Types ──────────────────────────────────────

interface OnchainAlertItem {
  id: string;
  category: 'mvrv' | 'whale' | 'liquidation' | 'flow';
  severity: 'info' | 'alert' | 'critical';
  title: string;
  body: string;
  value: number | null;
  timestamp: number;
}

interface OnchainSnapshot {
  mvrv: { value: number | null; zone: string | null; nupl: number | null };
  whale: { count: number; netflow: number; ratio: number };
  liquidation: { longTotal1h: number; shortTotal1h: number; total1h: number; dominance: string };
  exchangeFlow: { netflow24h: number | null; direction: string };
  alerts: OnchainAlertItem[];
  fetchedAt: number;
}

// ── State ────────────────────────────────────────────────────

let _timer: ReturnType<typeof setTimeout> | null = null;
let _initTimer: ReturnType<typeof setTimeout> | null = null;
let _startLoopTimer: ReturnType<typeof setTimeout> | null = null;
let _running = false;
let _intervalMs = DEFAULT_INTERVAL_MS;
let _previousSnapshot: ScanSnapshot | null = null;
let _previousOnchainAlertIds = new Set<string>();  // dedup onchain alerts
let _scanCount = 0;
let _lastScanAt = 0;
let _visibilityHandler: (() => void) | null = null;
let _scheduleNext: (() => void) | null = null;

// ── Core Logic ───────────────────────────────────────────────

async function fetchScanData(): Promise<ScanSnapshot | null> {
  try {
    const res = await fetch('/api/terminal/opportunity-scan?limit=15', {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.ok || !json?.data) return null;

    return {
      coins: json.data.coins ?? [],
      alerts: json.data.alerts ?? [],
      macroRegime: json.data.macroBackdrop?.regime ?? 'neutral',
      scannedAt: json.data.scannedAt ?? Date.now(),
    };
  } catch (err) {
    console.warn('[AlertEngine] fetch error:', err);
    return null;
  }
}

function detectChanges(prev: ScanSnapshot, curr: ScanSnapshot): void {
  const prevTop5 = prev.coins.slice(0, 5);
  const currTop5 = curr.coins.slice(0, 5);
  const prevSymbols = new Set(prevTop5.map(c => c.symbol));
  const currSymbols = new Set(currTop5.map(c => c.symbol));

  // 1. New entrant to top 5
  if (NEW_ENTRY_NOTIFY) {
    for (const coin of currTop5) {
      if (!prevSymbols.has(coin.symbol)) {
        notifications.addNotification({
          type: 'alert',
          title: `🎯 NEW TOP 5: ${coin.symbol}`,
          body: `${coin.name} entered top picks — Score ${coin.totalScore}/100 (${coin.direction.toUpperCase()}) ${coin.change24h >= 0 ? '+' : ''}${coin.change24h.toFixed(1)}%`,
          dismissable: true,
        });
      }
    }
  }

  // 2. Rank changes (big jumps)
  const prevRankMap = new Map(prev.coins.map((c, i) => [c.symbol, i]));
  for (let i = 0; i < currTop5.length; i++) {
    const sym = currTop5[i].symbol;
    const prevRank = prevRankMap.get(sym);
    if (prevRank != null && prevRank - i >= RANK_CHANGE_THRESHOLD) {
      toasts.addToast({
        level: 'medium',
        title: `📈 ${sym} jumped from #${prevRank + 1} → #${i + 1}`,
        score: currTop5[i].totalScore,
      });
    }
  }

  // 3. Macro regime change
  if (prev.macroRegime !== curr.macroRegime) {
    const icon = curr.macroRegime === 'risk-on' ? '🟢' : curr.macroRegime === 'risk-off' ? '🔴' : '🟡';
    notifications.addNotification({
      type: curr.macroRegime === 'risk-off' ? 'critical' : 'info',
      title: `${icon} MACRO REGIME → ${curr.macroRegime.toUpperCase()}`,
      body: `Macro environment shifted from ${prev.macroRegime} to ${curr.macroRegime}. Adjust strategy accordingly.`,
      dismissable: true,
    });
  }

  // 4. 1h price spike on any coin in top 10
  for (const coin of curr.coins.slice(0, 10)) {
    if (Math.abs(coin.change1h) >= PRICE_SPIKE_THRESHOLD_1H) {
      const prevCoin = prev.coins.find(c => c.symbol === coin.symbol);
      // Only fire if this spike is new (prev change1h was below threshold)
      if (!prevCoin || Math.abs(prevCoin.change1h) < PRICE_SPIKE_THRESHOLD_1H) {
        notifications.addNotification({
          type: Math.abs(coin.change1h) >= 10 ? 'critical' : 'alert',
          title: `⚡ ${coin.symbol} ${coin.change1h > 0 ? 'SURGE' : 'DROP'} ${coin.change1h > 0 ? '+' : ''}${coin.change1h.toFixed(1)}%`,
          body: `${coin.name} moved ${coin.change1h.toFixed(1)}% in the last hour. Score: ${coin.totalScore}/100.`,
          dismissable: true,
        });
      }
    }
  }

  // 5. New critical/warning alerts not seen before
  const prevAlertKeys = new Set(prev.alerts.map(a => `${a.symbol}:${a.type}`));
  for (const alert of curr.alerts) {
    if (alert.severity === 'critical' || alert.severity === 'warning') {
      const key = `${alert.symbol}:${alert.type}`;
      if (!prevAlertKeys.has(key)) {
        notifications.addNotification({
          type: alert.severity === 'critical' ? 'critical' : 'alert',
          title: `${alert.severity === 'critical' ? '🚨' : '⚠️'} ${alert.symbol} ${alert.type.toUpperCase()}`,
          body: alert.message,
          dismissable: true,
        });
      }
    }
  }

  // 6. High-score opportunity appeared
  for (const coin of currTop5) {
    if (coin.totalScore >= SCORE_THRESHOLD_NOTIFY) {
      const prevCoin = prev.coins.find(c => c.symbol === coin.symbol);
      if (!prevCoin || prevCoin.totalScore < SCORE_THRESHOLD_NOTIFY) {
        toasts.addToast({
          level: 'high',
          title: `🎯 ${coin.symbol} high-score opportunity (${coin.totalScore}/100)`,
          score: coin.totalScore,
        });
      }
    }
  }
}

// ── Onchain Alert Fetch ──────────────────────────────────────

async function fetchOnchainAlerts(): Promise<OnchainSnapshot | null> {
  try {
    const res = await fetch('/api/market/alerts/onchain', {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.ok || !json?.data) return null;
    return json.data as OnchainSnapshot;
  } catch (err) {
    console.warn('[AlertEngine] onchain fetch error:', err);
    return null;
  }
}

function processOnchainAlerts(snapshot: OnchainSnapshot): void {
  for (const alert of snapshot.alerts) {
    // Dedup: don't fire the same alert id twice within a session
    if (_previousOnchainAlertIds.has(alert.id)) continue;
    _previousOnchainAlertIds.add(alert.id);

    // Map severity → notification type
    const notifType = alert.severity === 'critical' ? 'critical'
      : alert.severity === 'alert' ? 'alert' : 'info';

    // Critical alerts (cascade, extreme MVRV) → persistent notification
    // Info/alert → toast for non-critical, notification for critical
    if (alert.severity === 'critical') {
      notifications.addNotification({
        type: notifType,
        title: alert.title,
        body: alert.body,
        dismissable: true,
      });
    } else if (alert.severity === 'alert') {
      notifications.addNotification({
        type: 'alert',
        title: alert.title,
        body: alert.body,
        dismissable: true,
      });
      toasts.addToast({
        level: 'high',
        title: alert.title,
        score: Math.min(100, Math.abs(alert.value ?? 50)),
      });
    } else {
      // info → toast only
      toasts.addToast({
        level: 'medium',
        title: alert.title,
        score: 0,
      });
    }
  }

  // Clean up old dedup entries (keep last 200)
  if (_previousOnchainAlertIds.size > 200) {
    const arr = [..._previousOnchainAlertIds];
    _previousOnchainAlertIds = new Set(arr.slice(-100));
  }
}

// ── Scan Cycle ───────────────────────────────────────────────

async function runScanCycle(): Promise<void> {
  // Parallel: opportunity scan + onchain alerts
  const [snapshotRes, onchainRes] = await Promise.allSettled([
    fetchScanData(),
    fetchOnchainAlerts(),
  ]);

  const snapshot = snapshotRes.status === 'fulfilled' ? snapshotRes.value : null;
  const onchain = onchainRes.status === 'fulfilled' ? onchainRes.value : null;

  _scanCount++;
  _lastScanAt = Date.now();

  // Process opportunity scan changes
  if (snapshot && snapshot.coins.length > 0) {
    if (_previousSnapshot && _previousSnapshot.coins.length > 0) {
      try {
        detectChanges(_previousSnapshot, snapshot);
      } catch (err) {
        console.warn('[AlertEngine] detectChanges error:', err);
      }
    }
    _previousSnapshot = snapshot;
  }

  // Process onchain alerts (MVRV, Whale, Liquidation, Flow)
  if (onchain) {
    try {
      processOnchainAlerts(onchain);
    } catch (err) {
      console.warn('[AlertEngine] onchain alert error:', err);
    }
  }
}

function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function getEffectiveIntervalMs(): number {
  if (isDocumentVisible()) return _intervalMs;
  return Math.max(_intervalMs, HIDDEN_INTERVAL_MS);
}

function clearTimers() {
  if (_initTimer) {
    clearTimeout(_initTimer);
    _initTimer = null;
  }
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  if (_startLoopTimer) {
    clearTimeout(_startLoopTimer);
    _startLoopTimer = null;
  }
}

// ── Public API ───────────────────────────────────────────────

export const alertEngine = {
  /** Start background monitoring. Idempotent. */
  start(intervalMs?: number) {
    if (_running) return;
    _running = true;
    _intervalMs = Math.max(MIN_INTERVAL_MS, intervalMs ?? DEFAULT_INTERVAL_MS);

    // Jittered initial delay: 30s + random(0-60s) → spreads 1000 clients over 90s window
    const initDelay = 30_000 + Math.floor(Math.random() * INIT_JITTER_MAX_MS);
    const scheduleNext = () => {
      if (!_running) return;
      const baseInterval = getEffectiveIntervalMs();
      const jitter = baseInterval * INTERVAL_JITTER_PCT;
      const nextMs = baseInterval + Math.floor(Math.random() * jitter * 2 - jitter);
      if (_timer) {
        clearTimeout(_timer);
        _timer = null;
      }
      _timer = setTimeout(() => {
        _timer = null;
        if (!_running) return;
        void runScanCycle().finally(scheduleNext);
      }, Math.max(MIN_INTERVAL_MS, nextMs));
    };
    _scheduleNext = scheduleNext;

    _initTimer = setTimeout(() => {
      _initTimer = null;
      if (!_running) return;
      if (!isDocumentVisible()) return;
      void runScanCycle();
    }, initDelay);

    _startLoopTimer = setTimeout(() => {
      _startLoopTimer = null;
      if (!_running) return;
      scheduleNext();
    }, initDelay + 1000);

    if (typeof document !== 'undefined') {
      _visibilityHandler = () => {
        if (!_running) return;
        if (document.visibilityState !== 'visible') return;
        if (_timer) {
          clearTimeout(_timer);
          _timer = null;
        }
        if (_startLoopTimer) {
          clearTimeout(_startLoopTimer);
          _startLoopTimer = null;
        }
        if (_initTimer) {
          clearTimeout(_initTimer);
          _initTimer = null;
        }
        void runScanCycle().finally(() => {
          _scheduleNext?.();
        });
      };
      document.addEventListener('visibilitychange', _visibilityHandler);
    }

  },

  /** Stop background monitoring. */
  stop() {
    _running = false;
    clearTimers();
    _scheduleNext = null;
    if (typeof document !== 'undefined' && _visibilityHandler) {
      document.removeEventListener('visibilitychange', _visibilityHandler);
      _visibilityHandler = null;
    }
  },

  /** Force an immediate scan cycle. */
  async scanNow(): Promise<void> {
    await runScanCycle();
  },

  /** Get engine status. */
  status() {
    return {
      running: _running,
      intervalMs: _intervalMs,
      scanCount: _scanCount,
      lastScanAt: _lastScanAt,
      hasPreviousData: _previousSnapshot != null,
    };
  },

  /** Update polling interval. */
  setInterval(ms: number) {
    _intervalMs = Math.max(MIN_INTERVAL_MS, ms);
    if (_running) {
      // Restart with new interval
      alertEngine.stop();
      alertEngine.start(_intervalMs);
    }
  },
};
