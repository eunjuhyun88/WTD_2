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
  import WatchlistHeader from './WatchlistHeader.svelte';
  import WatchlistItem from './WatchlistItem.svelte';

  const STORAGE_KEY     = 'cogochi:watchlist:v1';
  const FAVS_KEY        = 'cogochi:watchlist:favs:v1';
  const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'AVAXUSDT', 'DOGEUSDT'];
  const MAX_SYMBOLS     = 20;

  type WatchFilter = 'all' | 'favs';

  interface PatternRow { slug: string; label: string; symbol?: string; }
  interface WhaleAlert {
    symbol: string;
    amount: number;
    direction: 'buy' | 'sell';
    exchange: string;
    timestamp: number;
    confidence?: number;
  }
  interface Props {
    activeSymbol?: string;
    onSelectSymbol?: (symbol: string) => void;
    onNewTab?: (symbol: string) => void;
  }

  let { activeSymbol = 'BTCUSDT', onSelectSymbol, onNewTab }: Props = $props();

  function loadFavs(): Set<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(FAVS_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {}
    return new Set();
  }
  function saveFavs(f: Set<string>) {
    try { localStorage.setItem(FAVS_KEY, JSON.stringify([...f])); } catch {}
  }

  let favs: Set<string> = $state(loadFavs());
  let watchFilter = $state<WatchFilter>('all');

  function toggleFav(sym: string) {
    const next = new Set(favs);
    if (next.has(sym)) next.delete(sym); else next.add(sym);
    favs = next;
    saveFavs(next);
  }

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
  const visibleSymbols = $derived(
    watchFilter === 'favs' ? symbols.filter((s) => favs.has(s)) : symbols,
  );
  let ticks     = $state<Record<string, MiniTickerUpdate>>({});
  let sparkData = $state<Record<string, number[]>>({});
  let frMap     = $state<Record<string, number>>({});
  let myPatterns      = $state<PatternRow[]>([]);
  let patternsLoading = $state(true);
  let whaleAlerts     = $state<WhaleAlert[]>([]);
  let whaleCollapsed  = $state(false);
  // Re-render time-delta strings every 30s without re-fetching
  let whaleTick       = $state(0);
  let folded    = $state(
    typeof localStorage !== 'undefined' && localStorage.getItem('cogochi.watchlist.folded') === 'true'
  );
  let addOpen    = $state(false);
  let addInput   = $state('');
  let addError   = $state('');
  let focusedIdx = $state(-1);

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

  onMount(() => {
    // Keyboard nav events dispatched by TerminalHub
    const onNav = (e: Event) => {
      const dir = (e as CustomEvent<{ dir: 'up' | 'down' }>).detail.dir;
      if (symbols.length === 0) return;
      if (focusedIdx === -1) {
        focusedIdx = dir === 'down' ? 0 : symbols.length - 1;
      } else {
        focusedIdx = dir === 'down'
          ? Math.min(focusedIdx + 1, symbols.length - 1)
          : Math.max(focusedIdx - 1, 0);
      }
    };
    const onSelect = () => {
      if (focusedIdx >= 0 && focusedIdx < symbols.length) {
        onSelectSymbol?.(symbols[focusedIdx]);
        focusedIdx = -1;
      }
    };
    const onAdd = (e: Event) => {
      const sym = (e as CustomEvent<{ symbol: string }>).detail.symbol?.toUpperCase();
      if (!sym || symbols.includes(sym) || symbols.length >= MAX_SYMBOLS) return;
      if (!/^[A-Z]{2,10}USDT$/.test(sym)) return;
      symbols = [...symbols, sym];
      saveSymbols(symbols);
    };
    window.addEventListener('watchlist:nav', onNav);
    window.addEventListener('watchlist:select', onSelect);
    window.addEventListener('watchlist:add', onAdd);

    // Fetch patterns async (fire-and-forget, result stored in state)
    fetch('/api/patterns/terminal')
      .then(async (r) => {
        if (!r.ok) return;
        const d = (await r.json()) as { patterns?: Array<{ slug?: string; label?: string; symbol?: string }> };
        myPatterns = (d.patterns ?? [])
          .slice(0, 10)
          .map((p) => ({ slug: p.slug ?? '', label: p.label ?? p.slug ?? '', symbol: p.symbol }))
          .filter((p) => p.slug.length > 0);
      })
      .catch(() => { /* silent */ })
      .finally(() => { patternsLoading = false; });

    return () => {
      window.removeEventListener('watchlist:nav', onNav);
      window.removeEventListener('watchlist:select', onSelect);
      window.removeEventListener('watchlist:add', onAdd);
    };
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

  // Batch-fetch latest funding rate for each watchlist symbol (60s poll)
  $effect(() => {
    if (typeof window === 'undefined' || symbols.length === 0) return;
    const syms = [...symbols];

    async function loadFR() {
      const results = await Promise.allSettled(
        syms.map((sym) => fetch(`/api/market/funding?symbol=${sym}&limit=1`))
      );
      const next: Record<string, number> = { ...frMap };
      for (let i = 0; i < syms.length; i++) {
        const r = results[i];
        if (r.status !== 'fulfilled' || !r.value.ok) continue;
        try {
          const d = (await r.value.json()) as { bars?: { delta: number }[] };
          const bars = d.bars ?? [];
          if (bars.length > 0) next[syms[i]] = bars[bars.length - 1].delta;
        } catch { /* silent */ }
      }
      frMap = next;
    }

    void loadFR();
    const t = setInterval(loadFR, 60_000);
    return () => clearInterval(t);
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
    if (symbols.includes(sym)) { addError = 'Already added'; return; }
    if (symbols.length >= MAX_SYMBOLS) { addError = `Max ${MAX_SYMBOLS}`; return; }
    if (!/^[A-Z]{2,10}USDT$/.test(sym)) { addError = 'USDT pairs only (e.g. BTCUSDT)'; return; }
    symbols = [...symbols, sym];
    saveSymbols(symbols);
    addInput = '';
    addOpen = false;
  }

  function onAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') addSymbol();
    if (e.key === 'Escape') { addOpen = false; addInput = ''; addError = ''; }
  }
</script>

<div class="rail" class:rail--folded={folded}>

  <!-- WATCHLIST header + add-symbol input -->
  <WatchlistHeader
    symbolCount={symbols.length}
    maxSymbols={MAX_SYMBOLS}
    {folded}
    {addOpen}
    bind:addInput
    {addError}
    onToggleFold={() => (folded = !folded)}
    onToggleAdd={() => { addOpen = !addOpen; addError = ''; }}
    onAddConfirm={addSymbol}
    onAddCancel={() => { addOpen = false; addInput = ''; addError = ''; }}
    {onAddKeydown}
  />

  <!-- Filter chips (all / favs) -->
  {#if !folded}
    <div class="filter-strip">
      <button
        class="chip"
        class:chip--active={watchFilter === 'all'}
        onclick={() => (watchFilter = 'all')}
      >All</button>
      <button
        class="chip"
        class:chip--active={watchFilter === 'favs'}
        onclick={() => (watchFilter = 'favs')}
      >★ Favs{favs.size > 0 ? ` (${favs.size})` : ''}</button>
    </div>
  {/if}

  <!-- Symbol list -->
  <ul class="symbol-list">
    {#each visibleSymbols as sym, i (sym)}
      <WatchlistItem
        {sym}
        tick={ticks[sym]}
        spark={sparkData[sym] ?? []}
        active={sym === activeSymbol}
        focused={i === focusedIdx}
        {folded}
        fr={frMap[sym] ?? null}
        favorited={favs.has(sym)}
        onSelect={(s) => { focusedIdx = -1; pick(s); }}
        onRemove={removeSymbol}
        onToggleFav={toggleFav}
        {onNewTab}
      />
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
      <span class="section-label">My Patterns</span>
      {#if !patternsLoading}
        <span class="section-count">{myPatterns.length}</span>
      {/if}
    </div>
    {#if patternsLoading}
      <div class="empty">loading…</div>
    {:else if myPatterns.length === 0}
      <div class="empty">None</div>
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
    width: 36px;
    min-width: 36px;
    overflow: hidden;
  }

  .rail--folded :global(.symbol-row) {
    justify-content: center;
    padding: 4px 2px;
  }

  .rail--folded :global(.sym-name) { font-size: var(--ui-text-xs); }

  .fold-btn {
    background: none;
    border: none;
    color: var(--g5);
    cursor: pointer;
    font-size: 11px;
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
    padding: 4px 8px 3px;
    font-size: var(--ui-text-xs);
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

  .section-label { font-weight: 600; }
  .section-count { font-size: var(--ui-text-xs); color: var(--g6); }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .symbol-list, .pattern-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .pattern-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 0.5px solid var(--g3);
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }

  .alert-time {
    margin-left: auto;
    color: var(--g5);
    font-size: var(--ui-text-xs);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .filter-strip {
    display: flex;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--g3);
    background: var(--g0);
    flex-shrink: 0;
  }

  .chip {
    background: none;
    border: 1px solid var(--g3);
    border-radius: 4px;
    color: var(--g6);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.04em;
    padding: 2px 6px;
    transition: border-color 0.1s, color 0.1s, background 0.1s;
  }
  .chip:hover { border-color: var(--g5); color: var(--g8); }
  .chip--active { border-color: var(--brand); color: var(--brand); background: rgba(var(--brand-rgb, 82,130,255), 0.08); }
</style>
