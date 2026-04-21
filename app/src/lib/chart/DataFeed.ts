/**
 * DataFeed — resilient real-time chart data orchestrator
 *
 * Responsibilities:
 *   1. Fetch historical data from /api/chart/feed (parallel, cached server-side)
 *   2. Stream live candles via Binance WebSocket (direct, no server hop)
 *   3. Auto-reconnect WS with exponential backoff + gap fill on reconnect
 *   4. Poll /api/chart/feed every POLL_INTERVAL_MS for sub-pane refresh
 *      (OI, funding, liquidations) — 500 users share 1 Redis cache entry
 *
 * Usage:
 *   const feed = new DataFeed({ symbol: 'BTCUSDT', tf: '1h' });
 *   feed.onBar   = (bar) => priceSeries.update(bar);
 *   feed.onLoad  = (payload) => initAllPanes(payload);
 *   feed.onPoll  = (payload) => refreshSubPanes(payload);
 *   await feed.connect();
 *   // on cleanup:
 *   feed.disconnect();
 */

import type { ChartPayload, LiqBar } from '$lib/server/chart/chartSeriesService';

export type { ChartPayload, LiqBar };

export interface CandleBar {
  time: number;   // Unix seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Binance WS stream — fstream for perp (has OI-weighted symbols), stream for spot
const WS_PERP_BASE = 'wss://fstream.binance.com/ws';
const WS_SPOT_BASE = 'wss://stream.binance.com:9443/ws';

// Sub-pane poll interval — server Redis TTL is 30s so polling at 60s is safe
const POLL_INTERVAL_MS = 60_000;

// WS reconnect back-off: 100 ms → 300 → 1 000 → 3 000 → 10 000 (cap)
const BACKOFF_STEPS = [100, 300, 1_000, 3_000, 10_000];

export class DataFeed {
  // ── Config ────────────────────────────────────────────────────────────────
  private symbol: string;
  private tf: string;

  // ── Callbacks (set before connect()) ─────────────────────────────────────
  /** Fired once on initial historical load and on every poll refresh */
  onLoad: ((payload: ChartPayload) => void) | null = null;
  /** Fired on every sub-pane poll (60s) — skips initial load */
  onPoll: ((payload: ChartPayload) => void) | null = null;
  /** Fired on every live tick from Binance WS */
  onBar: ((bar: CandleBar, isClosed: boolean) => void) | null = null;
  /** Fired on WS connect / reconnect */
  onWsStatus: ((status: 'connected' | 'disconnected' | 'reconnecting') => void) | null = null;

  // ── Internal state ────────────────────────────────────────────────────────
  private ws: WebSocket | null = null;
  private wsBackoffIdx = 0;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastBarTime = 0;   // Unix seconds of last confirmed candle close
  private destroyed = false;

  constructor(opts: { symbol: string; tf: string }) {
    this.symbol = opts.symbol.toUpperCase();
    this.tf = opts.tf.toLowerCase();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.destroyed) return;
    await this._initialLoad();
    this._connectWS();
    this._startPollTimer();
  }

  disconnect(): void {
    this.destroyed = true;
    this._clearWsTimer();
    this._clearPollTimer();
    if (this.ws) {
      this.ws.onclose = null; // suppress auto-reconnect
      this.ws.close();
      this.ws = null;
    }
  }

  /** Call when symbol or timeframe changes — resets and reconnects */
  async reconfigure(symbol: string, tf: string): Promise<void> {
    const wasDestroyed = this.destroyed;
    this.destroyed = true;

    this._clearWsTimer();
    this._clearPollTimer();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.symbol = symbol.toUpperCase();
    this.tf = tf.toLowerCase();
    this.wsBackoffIdx = 0;
    this.lastBarTime = 0;
    this.destroyed = wasDestroyed;

    if (!this.destroyed) {
      await this._initialLoad();
      this._connectWS();
      this._startPollTimer();
    }
  }

  // ── Initial load ──────────────────────────────────────────────────────────

  private async _initialLoad(): Promise<void> {
    try {
      const payload = await this._fetchFeed();
      if (payload && payload.klines.length > 0) {
        this.lastBarTime = payload.klines[payload.klines.length - 1].time;
      }
      if (payload) this.onLoad?.(payload);
    } catch {
      // Non-fatal — WS will stream live; UI shows skeleton until loaded
    }
  }

  // ── Feed fetch (shared for initial + poll) ────────────────────────────────

  private async _fetchFeed(): Promise<ChartPayload | null> {
    const url = `/api/chart/feed?symbol=${this.symbol}&tf=${this.tf}&limit=500`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      return res.json() as Promise<ChartPayload>;
    } catch {
      return null;
    }
  }

  // ── Poll timer ────────────────────────────────────────────────────────────

  private _startPollTimer(): void {
    this._clearPollTimer();
    this.pollTimer = setInterval(async () => {
      if (this.destroyed) return;
      try {
        const payload = await this._fetchFeed();
        if (payload) this.onPoll?.(payload);
      } catch { /* silent */ }
    }, POLL_INTERVAL_MS);
  }

  private _clearPollTimer(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────

  private _connectWS(): void {
    if (this.destroyed) return;

    const sym = this.symbol.toLowerCase();
    // Use perp stream for USDT pairs (has funding/OI context), spot otherwise
    const base = this.symbol.endsWith('USDT') ? WS_PERP_BASE : WS_SPOT_BASE;
    const stream = `${sym}@kline_${this._toBinanceTf(this.tf)}`;
    const url = `${base}/${stream}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this._scheduleWsReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.wsBackoffIdx = 0; // reset back-off on successful connect
      this.onWsStatus?.('connected');
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      if (this.destroyed) return;
      try {
        const msg = JSON.parse(ev.data as string);
        const k = msg?.k;
        if (!k) return;

        const bar: CandleBar = {
          time:   Math.floor(Number(k.t) / 1000),
          open:   parseFloat(k.o),
          high:   parseFloat(k.h),
          low:    parseFloat(k.l),
          close:  parseFloat(k.c),
          volume: parseFloat(k.v),
        };
        const isClosed: boolean = Boolean(k.x);

        if (isClosed) {
          this.lastBarTime = bar.time;
          // Trigger gap-fill if we've missed bars (e.g. after reconnect)
          void this._gapFillIfNeeded(bar.time);
        }

        this.onBar?.(bar, isClosed);
      } catch { /* malformed frame — skip */ }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.destroyed) {
        this.onWsStatus?.('disconnected');
        this._scheduleWsReconnect();
      }
    };

    // Heartbeat: close & reconnect if server sends no data for 45s
    this._startHeartbeat();
  }

  private _scheduleWsReconnect(): void {
    if (this.destroyed) return;
    this._clearWsTimer();
    const delay = BACKOFF_STEPS[Math.min(this.wsBackoffIdx, BACKOFF_STEPS.length - 1)];
    this.wsBackoffIdx = Math.min(this.wsBackoffIdx + 1, BACKOFF_STEPS.length - 1);
    this.onWsStatus?.('reconnecting');
    this.wsReconnectTimer = setTimeout(() => {
      if (!this.destroyed) this._connectWS();
    }, delay);
  }

  private _clearWsTimer(): void {
    if (this.wsReconnectTimer !== null) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
  }

  // ── Heartbeat (45s silence = treat as stale connection) ──────────────────

  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  private _startHeartbeat(): void {
    this._clearHeartbeat();
    this.heartbeatTimer = setTimeout(() => {
      // No message received in 45s — force reconnect
      this.ws?.close();
    }, 45_000);
  }

  private _clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Gap fill ──────────────────────────────────────────────────────────────

  /**
   * If the candle we just received from WS is more than 1 bar ahead of the
   * last bar we knew about (e.g. after a reconnect), fetch the feed again to
   * back-fill missing candles into the chart.
   */
  private async _gapFillIfNeeded(newBarTime: number): Promise<void> {
    if (this.lastBarTime === 0) return;
    const tfMs = this._tfMs(this.tf);
    const expectedNext = this.lastBarTime + tfMs / 1000;
    if (newBarTime <= expectedNext + 5) return; // within 5s tolerance = no gap

    // Gap detected — re-fetch to fill
    try {
      const payload = await this._fetchFeed();
      if (payload) this.onLoad?.(payload);
    } catch { /* non-fatal */ }
  }

  // ── Timeframe helpers ─────────────────────────────────────────────────────

  private _toBinanceTf(tf: string): string {
    const map: Record<string, string> = {
      '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m',
      '1h':'1h','2h':'2h','4h':'4h','6h':'6h','12h':'12h','1d':'1d','1w':'1w',
    };
    return map[tf] ?? '1h';
  }

  private _tfMs(tf: string): number {
    const units: Record<string, number> = {
      m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000,
    };
    const n = parseInt(tf);
    const u = tf.slice(-1);
    return n * (units[u] ?? 3_600_000);
  }
}
