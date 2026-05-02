<script lang="ts">
  /**
   * WatchlistRail — TV-style left rail
   * - Top: user-configurable symbol list (add/delete, max 20, localStorage)
   * - Fold/unfold toggle (‹/›)
   * - Real-time price feed: Binance miniTicker WebSocket ~1s
   * - Bottom: "내 패턴" section sourced from /api/patterns/terminal
   */
  import { onMount } from 'svelte';
  import { subscribeMiniTicker, type MiniTickerUpdate } from '$lib/api/binance';

  const STORAGE_KEY = 'cogochi:watchlist:v1';
  const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'AVAXUSDT', 'DOGEUSDT'];
  const MAX_SYMBOLS = 20;

  interface PatternRow { slug: string; label: string; symbol?: string; }
  interface WhaleAlert {
    symbol: string;
    amount: number;       // USD
    direction: 'buy' | 'sell';
    exchange: string;
    timestamp: number;    // unix ms
    confidence?: number;  // 0-100
  }
  interface Props { activeSymbol?: string; onSelectSymbol?: (symbol: string) => void; }

  let { activeSymbol = 'BTCUSDT', onSelectSymbol }: Props = $props();

  function loadSymbols(): string[] {
    if (typeof localStorage === 'undefined') return [...DEFAULT_SYMBOLS];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
      }
    } catch {}
    return [...DEFAULT_SYMBOLS];
  }

  function saveSymbols(syms: string[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(syms)); } catch {}
  }

  let symbols   = $state<string[]>(loadSymbols());
  let ticks     = $state<Record<string, MiniTickerUpdate>>({});
  let sparkData = $state<Record<string, number[]>>({});
  let myPatterns      = $state<PatternRow[]>([]);
  let patternsLoading = $state(true);
  let whaleAlerts     = $state<WhaleAlert[]>([]);
  let whaleCollapsed  = $state(false);
  // Re-render time-delta strings every 30s without re-fetching
  let whaleTick       = $state(0);
  let folded    = $state(
    typeof localStorage !== 'undefined' && localStorage.getItem('cogochi.watchlist.folded') === 'true'
  );
  let addOpen   = $state(false);
  let addInput  = $state('');
  let addError  = $state('');

  // Persist fold state
  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('cogochi.watchlist.folded', String(folded));
    } catch {}
  });

  // Re-subscribe whenever symbols list changes
  $effect(() => {
    if (typeof window === 'undefined' || symbols.length === 0) return;
    const syms = [...symbols];
    const unsub = subscribeMiniTicker(
      syms,
      () => {},
      (updates) => {
        ticks = { ...ticks, ...updates };
        const next: Record<string, number[]> = { ...sparkData };
        for (const [sym, tick] of Object.entries(updates)) {
          const prev = next[sym] ?? [];
          next[sym] = [...prev.slice(-6), tick.price];
        }
        sparkData = next;
      },
    );
    return () => unsub();
  });

  onMount(async () => {
    try {
      const r = await fetch('/api/patterns/terminal');
      if (r.ok) {
        const d = (await r.json()) as { patterns?: Array<{ slug?: string; label?: string; symbol?: string }> };
        myPatterns = (d.patterns ?? [])
          .slice(0, 10)
          .map((p) => ({ slug: p.slug ?? '', label: p.label ?? p.slug ?? '', symbol: p.symbol }))
          .filter((p) => p.slug.length > 0);
      }
    } catch { /* silent */ } finally { patternsLoading = false; }
  });

  // Whale alerts: fetch + 10s polling, keyed off the watchlist symbols.
  $effect(() => {
    if (typeof window === 'undefined' || symbols.length === 0) return;
    const syms = symbols.join(',');
    let cancelled = false;

    async function load() {
      try {
        const r = await fetch(`/api/whale-alerts?symbols=${encodeURIComponent(syms)}&limit=5`);
        if (!r.ok) return;
        const d = (await r.json()) as { alerts?: WhaleAlert[] };
        if (!cancelled && Array.isArray(d.alerts)) whaleAlerts = d.alerts;
      } catch { /* silent */ }
    }

    void load();
    const poll = setInterval(load, 10_000);
    const ticker = setInterval(() => { whaleTick = whaleTick + 1; }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(ticker);
    };
  });

  function pick(symbol: string) { onSelectSymbol?.(symbol); }
  function shortName(s: string) { return s.replace(/USDT$/, ''); }

  function getTimeDelta(timestamp: number, _tick: number = 0): string {
    void _tick; // referenced so $derived/effects re-run on whaleTick change
    const diffMs = Date.now() - timestamp;
    const diffM = Math.floor(diffMs / 60_000);
    const diffH = Math.floor(diffM / 60);
    if (diffM < 1) return 'now';
    if (diffM < 60) return `${diffM}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  }

  function fmtAmount(usd: number): string {
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
    return `$${usd.toFixed(0)}`;
  }

  function focusWhale(alert: WhaleAlert) {
    const sym = alert.symbol.toUpperCase();
    // Add to watchlist if missing so the row exists to highlight.
    if (!symbols.includes(sym) && symbols.length < MAX_SYMBOLS && /^[A-Z]{2,10}USDT$/.test(sym)) {
      symbols = [...symbols, sym];
      saveSymbols(symbols);
    }
    onSelectSymbol?.(sym);
  }

  function removeSymbol(sym: string) {
    symbols = symbols.filter(s => s !== sym);
    saveSymbols(symbols);
  }

  function addSymbol() {
    const sym = addInput.trim().toUpperCase();
    addError = '';
    if (!sym) return;
    if (symbols.includes(sym)) { addError = '이미 추가됨'; return; }
    if (symbols.length >= MAX_SYMBOLS) { addError = `최대 ${MAX_SYMBOLS}개`; return; }
    if (!/^[A-Z]{2,10}USDT$/.test(sym)) { addError = 'USDT 페어만 지원 (예: BTCUSDT)'; return; }
    symbols = [...symbols, sym];
    saveSymbols(symbols);
    addInput = '';
    addOpen = false;
  }

  function onAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') addSymbol();
    if (e.key === 'Escape') { addOpen = false; addInput = ''; addError = ''; }
  }

  function fmtPrice(p: number): string {
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1000)  return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1)     return p.toFixed(3);
    return p.toPrecision(4);
  }

  function fmtChange(c: number): string {
    return (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
  }

  function sparkPolyline(prices: number[]): string {
    const W = 30, H = 14;
    const min = Math.min(...prices), max = Math.max(...prices);
    const range = max - min || 1;
    return prices
      .map((p, i) => `${((i / (prices.length - 1)) * W).toFixed(1)},${(H - ((p - min) / range) * H).toFixed(1)}`)
      .join(' ');
  }
</script>

<div class="rail" class:rail--folded={folded}>

  <!-- WATCHLIST header -->
  <div class="section-header">
    {#if !folded}
      <span class="section-label">WATCHLIST</span>
      <span class="section-actions">
        <span class="section-count">{symbols.length}/{MAX_SYMBOLS}</span>
        {#if symbols.length < MAX_SYMBOLS}
          <button
            class="add-btn"
            onclick={() => { addOpen = !addOpen; addError = ''; }}
            title="심볼 추가"
            aria-label="Add symbol"
          >+</button>
        {/if}
      </span>
    {/if}
    <button
      class="fold-btn"
      onclick={() => (folded = !folded)}
      title={folded ? 'Expand watchlist' : 'Collapse watchlist'}
      aria-label={folded ? 'Expand watchlist' : 'Collapse watchlist'}
    >{folded ? '›' : '‹'}</button>
  </div>

  <!-- Add symbol input -->
  {#if !folded && addOpen}
    <div class="add-row">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="add-input"
        type="text"
        placeholder="SOLUSDT…"
        bind:value={addInput}
        onkeydown={onAddKeydown}
        maxlength={12}
        autofocus
      />
      <button class="add-confirm" onclick={addSymbol} title="확인">+</button>
      <button class="add-cancel" onclick={() => { addOpen = false; addInput = ''; addError = ''; }} title="취소">✕</button>
    </div>
    {#if addError}
      <div class="add-error">{addError}</div>
    {/if}
  {/if}

  <!-- Symbol list -->
  <ul class="symbol-list">
    {#each symbols as sym (sym)}
      {@const tick = ticks[sym]}
      {@const spark = sparkData[sym] ?? []}
      <li class="symbol-item">
        <button
          type="button"
          class="symbol-row"
          class:active={sym === activeSymbol}
          onclick={() => pick(sym)}
          title={sym}
        >
          <span class="sym-name">{shortName(sym)}</span>
          {#if !folded}
            <span class="sym-right">
              {#if tick}
                <span class="sym-price">{fmtPrice(tick.price)}</span>
                <span class="sym-bottom">
                  <span class="sym-change" class:up={tick.change24h >= 0} class:dn={tick.change24h < 0}>
                    {fmtChange(tick.change24h)}
                  </span>
                  {#if spark.length >= 3}
                    <svg class="sparkline" viewBox="0 0 30 14" width="30" height="14">
                      <polyline
                        points={sparkPolyline(spark)}
                        fill="none"
                        stroke={tick.change24h >= 0 ? '#22AB94' : '#F23645'}
                        stroke-width="1.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  {/if}
                </span>
              {:else}
                <span class="sym-loading">…</span>
              {/if}
            </span>
            <button
              type="button"
              class="del-btn"
              onclick={(e) => { e.stopPropagation(); removeSymbol(sym); }}
              title="제거"
              aria-label="Remove {sym}"
            >×</button>
          {/if}
        </button>
      </li>
    {/each}
  </ul>

  <!-- WHALE ALERTS -->
  {#if !folded && whaleAlerts.length > 0}
    <div class="section-header">
      <span class="section-label">WHALE ALERTS</span>
      <span class="section-actions">
        <span class="section-count">{whaleAlerts.length}</span>
        <button
          class="fold-btn"
          onclick={() => (whaleCollapsed = !whaleCollapsed)}
          title={whaleCollapsed ? 'Expand whale alerts' : 'Collapse whale alerts'}
          aria-label={whaleCollapsed ? 'Expand whale alerts' : 'Collapse whale alerts'}
        >{whaleCollapsed ? '▶' : '▼'}</button>
      </span>
    </div>
    {#if !whaleCollapsed}
      <ul class="whale-list">
        {#each whaleAlerts as alert (alert.timestamp + alert.symbol + alert.exchange)}
          <li>
            <button
              type="button"
              class="whale-alert"
              class:buy={alert.direction === 'buy'}
              class:sell={alert.direction === 'sell'}
              onclick={() => focusWhale(alert)}
              title="{alert.direction.toUpperCase()} {fmtAmount(alert.amount)} on {alert.exchange}"
            >
              <span class="alert-symbol">{shortName(alert.symbol)}</span>
              <span class="alert-direction">{alert.direction === 'buy' ? '↑' : '↓'}</span>
              <span class="alert-amount">{fmtAmount(alert.amount)}</span>
              <span class="alert-exchange">{alert.exchange}</span>
              <span class="alert-time">{getTimeDelta(alert.timestamp, whaleTick)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <!-- 내 패턴 -->
  {#if !folded}
    <div class="section-header">
      <span class="section-label">내 패턴</span>
      {#if !patternsLoading}
        <span class="section-count">{myPatterns.length}</span>
      {/if}
    </div>
    {#if patternsLoading}
      <div class="empty">loading…</div>
    {:else if myPatterns.length === 0}
      <div class="empty">없음</div>
    {:else}
      <ul class="pattern-list">
        {#each myPatterns as p (p.slug)}
          <li>
            <button
              type="button"
              class="pattern-row"
              title={p.slug}
              onclick={() => onSelectSymbol?.(p.symbol ?? activeSymbol)}
            >
              <span class="pattern-dot"></span>
              <span class="pattern-label">{p.label}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .rail {
    width: 100%;
    height: 100%;
    background: var(--g1);
    border-right: 1px solid var(--g5);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    font-family: 'JetBrains Mono', monospace;
    color: var(--g8);
    transition: width 0.2s ease;
  }

  .rail--folded {
    width: 56px;
    min-width: 56px;
    overflow: hidden;
  }

  .rail--folded .symbol-row {
    justify-content: center;
    padding: 6px 4px;
  }

  .rail--folded .sym-name { font-size: 9px; }

  .fold-btn {
    background: none;
    border: none;
    color: var(--g5);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
    transition: color 0.1s;
  }
  .fold-btn:hover { color: var(--g8); }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px 4px;
    font-size: 10px;
    color: var(--g5);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--g4);
    background: var(--g0);
    position: sticky;
    top: 0;
    z-index: 1;
    flex-shrink: 0;
  }

  .rail--folded .section-header {
    justify-content: center;
    padding: 8px 4px 4px;
  }

  .section-label { font-weight: 600; }
  .section-count { font-size: 8px; color: var(--g6); }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .add-btn {
    background: none;
    border: 1px solid var(--g4);
    color: var(--g6);
    font-size: 11px;
    line-height: 1;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.1s, border-color 0.1s;
  }
  .add-btn:hover { color: var(--g9); border-color: var(--g6); }

  .add-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    background: var(--g1);
    border-bottom: 1px solid var(--g4);
    flex-shrink: 0;
  }

  .add-input {
    flex: 1;
    background: var(--g2);
    border: 1px solid var(--g4);
    border-radius: 4px;
    color: var(--g9);
    font-family: inherit;
    font-size: 10px;
    padding: 3px 6px;
    outline: none;
    text-transform: uppercase;
    min-width: 0;
  }
  .add-input:focus { border-color: var(--brand); }
  .add-input::placeholder { text-transform: none; color: var(--g5); }

  .add-confirm, .add-cancel {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    line-height: 1;
    flex-shrink: 0;
    transition: color 0.1s;
  }
  .add-confirm { color: #22AB94; }
  .add-confirm:hover { color: #4ade80; }
  .add-cancel { color: var(--g5); }
  .add-cancel:hover { color: var(--g8); }

  .add-error {
    padding: 2px 8px 4px;
    font-size: 9px;
    color: #F23645;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .symbol-list, .pattern-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .symbol-item { position: relative; }

  .symbol-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-bottom: 0.5px solid var(--g3);
    color: var(--g8);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .symbol-row:hover { background: var(--g2); }
  .symbol-row:hover .del-btn { opacity: 1; }

  .symbol-row.active {
    background: var(--g3);
    color: var(--g9);
    border-left: 2px solid var(--brand);
    padding-left: 8px;
  }

  .del-btn {
    background: none;
    border: none;
    color: var(--g5);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 0 0 0 4px;
    opacity: 0;
    transition: opacity 0.1s, color 0.1s;
    flex-shrink: 0;
  }
  .del-btn:hover { color: #F23645; }

  .sym-name {
    font-weight: 600;
    letter-spacing: 0.02em;
    font-size: 11px;
  }

  .sym-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .sym-price {
    font-size: 11px;
    color: var(--g9);
    letter-spacing: 0.01em;
    font-variant-numeric: tabular-nums;
  }

  .sym-bottom {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sym-change {
    font-size: 11px;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
  }
  .sym-change.up { color: #22AB94; }
  .sym-change.dn { color: #F23645; }

  .sparkline { display: block; flex-shrink: 0; }

  .sym-loading {
    font-size: 9px;
    color: var(--g5);
    animation: blink 1.2s infinite;
  }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .pattern-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 0.5px solid var(--g3);
    font-size: 10px;
    font-family: inherit;
    color: var(--g7);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }
  .pattern-row:hover { background: var(--g2); }

  .pattern-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--brand);
    flex-shrink: 0;
  }

  .pattern-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    padding: 6px 10px;
    font-size: 9px;
    color: var(--g5);
    letter-spacing: 0.08em;
  }

  .whale-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 160px;
    overflow-y: auto;
  }

  .whale-alert {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 10px;
    background: transparent;
    border: none;
    border-bottom: 0.5px solid var(--g3);
    color: var(--g8);
    font-family: inherit;
    font-size: 9px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }
  .whale-alert:hover { background: var(--g2); }

  .whale-alert.buy .alert-direction,
  .whale-alert.buy .alert-amount { color: #22AB94; }
  .whale-alert.sell .alert-direction,
  .whale-alert.sell .alert-amount { color: #F23645; }

  .alert-symbol {
    font-weight: 600;
    flex-shrink: 0;
    letter-spacing: 0.02em;
  }

  .alert-direction {
    flex-shrink: 0;
    font-weight: 600;
  }

  .alert-amount {
    flex-shrink: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .alert-exchange {
    color: var(--g6);
    flex-shrink: 0;
    font-size: 8px;
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }

  .alert-time {
    margin-left: auto;
    color: var(--g5);
    font-size: 8px;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
