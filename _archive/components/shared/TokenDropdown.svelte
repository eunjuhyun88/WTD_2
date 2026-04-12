<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { fetch24hr, fetch24hrMulti, type Binance24hr } from '$lib/api/binance';
  import { TOKENS, TOKEN_CATEGORIES, TOKEN_MAP, getAllBinanceSymbols, type TokenDef } from '$lib/data/tokens';

  const dispatch = createEventDispatcher<{ select: { pair: string; token: TokenDef } }>();

  export let value = 'BTC/USDT';
  export let compact = false;

  type CategoryKey = keyof typeof TOKEN_CATEGORIES;
  type TabKey = 'all' | CategoryKey;
  type MarketStats = {
    price: number | null;
    change24h: number | null;
    quoteVolume: number | null;
  };
  type MarketRow = {
    token: TokenDef;
    pair: string;
    stats: MarketStats;
  };

  const MOBILE_BREAKPOINT = 768;
  const TAB_ORDER: TabKey[] = ['all', 'major', 'l1l2', 'defi', 'meme', 'ai_gaming', 'infra'];
  const TAB_LABELS: Record<TabKey, string> = {
    all: 'ALL',
    major: 'MAJOR',
    l1l2: 'L1/L2',
    defi: 'DEFI',
    meme: 'MEME',
    ai_gaming: 'AI/GAME',
    infra: 'INFRA',
  };
  const QUICK_SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'CRV'] as const;
  const TOKEN_ORDER = new Map(TOKENS.map((t, idx) => [t.symbol, idx]));

  let open = false;
  let filter = '';
  let showSearch = false;
  let activeTab: TabKey = 'all';
  let isMobileSheet = false;
  let panelStyle = '';

  let triggerEl: HTMLButtonElement | null = null;
  let searchEl: HTMLInputElement | null = null;

  let statsLoading = false;
  let statsError = '';
  let statsMap = new Map<string, MarketStats>();

  $: currentSymbol = (value.split('/')[0] || 'BTC').toUpperCase();
  $: currentToken = TOKEN_MAP.get(currentSymbol) || TOKENS[0];

  $: rows = TOKENS.map((token) => ({
    token,
    pair: `${token.symbol}/USDT`,
    stats: statsMap.get(token.symbol) || { price: null, change24h: null, quoteVolume: null },
  })) as MarketRow[];

  $: filteredRows = rows
    .filter((row) => matchTab(row, activeTab) && matchFilter(row, filter))
    .sort((a, b) => {
      const av = a.stats.quoteVolume;
      const bv = b.stats.quoteVolume;
      const aa = Number.isFinite(av as number) ? (av as number) : -1;
      const bb = Number.isFinite(bv as number) ? (bv as number) : -1;
      if (aa !== bb) return bb - aa;
      const ai = TOKEN_ORDER.get(a.token.symbol) ?? 0;
      const bi = TOKEN_ORDER.get(b.token.symbol) ?? 0;
      return ai - bi;
    });
  $: quickRows = QUICK_SYMBOLS
    .map((sym) => rows.find((row) => row.token.symbol === sym))
    .filter((row): row is MarketRow => !!row);

  function matchTab(row: MarketRow, tab: TabKey) {
    if (tab === 'all') return true;
    const symbols = TOKEN_CATEGORIES[tab] || [];
    return symbols.includes(row.token.symbol);
  }

  function matchFilter(row: MarketRow, input: string) {
    const q = input.trim().toLowerCase();
    if (!q) return true;
    return (
      row.token.symbol.toLowerCase().includes(q) ||
      row.token.name.toLowerCase().includes(q) ||
      row.pair.toLowerCase().includes(q) ||
      row.token.binanceSymbol.toLowerCase().includes(q)
    );
  }

  function updateViewportMode() {
    if (typeof window === 'undefined') return;
    isMobileSheet = window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function placePanel() {
    if (!open || isMobileSheet || !triggerEl || typeof window === 'undefined') {
      panelStyle = '';
      return;
    }

    const rect = triggerEl.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(500, window.innerWidth - margin * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;
    const top = rect.bottom + 8;
    const maxHeight = Math.max(260, window.innerHeight - top - margin);
    panelStyle = `left:${left}px;top:${top}px;width:${width}px;max-height:${maxHeight}px;`;
  }

  async function openDropdown() {
    open = true;
    filter = '';
    showSearch = false;
    updateViewportMode();
    await tick();
    placePanel();
    void loadTickerStats();
  }

  function closeDropdown() {
    open = false;
  }

  function toggleDropdown() {
    if (open) {
      closeDropdown();
      return;
    }
    void openDropdown();
  }

  async function toggleSearch() {
    showSearch = !showSearch;
    if (!showSearch) {
      filter = '';
      return;
    }
    await tick();
    searchEl?.focus();
  }

  function selectToken(sym: string) {
    const token = TOKEN_MAP.get(sym);
    if (!token) return;
    dispatch('select', { pair: `${sym}/USDT`, token });
    closeDropdown();
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  }

  function handleViewportChange() {
    updateViewportMode();
    placePanel();
  }

  function isFulfilled<T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> {
    return r.status === 'fulfilled';
  }

  async function loadTickerStats() {
    if (statsLoading) return;
    statsLoading = true;
    statsError = '';

    try {
      const symbols = getAllBinanceSymbols();
      let allRows: Binance24hr[] = [];

      try {
        allRows = await fetch24hrMulti(symbols);
      } catch {
        const chunkSize = 16;
        const chunks: string[][] = [];
        for (let i = 0; i < symbols.length; i += chunkSize) chunks.push(symbols.slice(i, i + chunkSize));

        const chunkResults = await Promise.all(
          chunks.map(async (chunk) => {
            try {
              return await fetch24hrMulti(chunk);
            } catch {
              const settled = await Promise.allSettled(chunk.map((sym) => fetch24hr(sym)));
              return settled.filter(isFulfilled).map((x) => x.value);
            }
          })
        );
        allRows = chunkResults.flat();
      }

      const next = new Map<string, MarketStats>();
      for (const row of allRows) {
        const sym = String((row as any)?.symbol || '').toUpperCase();
        if (!sym.endsWith('USDT')) continue;
        const base = sym.slice(0, -4);
        if (!TOKEN_MAP.has(base)) continue;

        const price = Number((row as any)?.lastPrice);
        const change24h = Number((row as any)?.priceChangePercent);
        const quoteVolume = Number((row as any)?.quoteVolume);

        next.set(base, {
          price: Number.isFinite(price) ? price : null,
          change24h: Number.isFinite(change24h) ? change24h : null,
          quoteVolume: Number.isFinite(quoteVolume) ? quoteVolume : null,
        });
      }
      statsMap = next;
    } catch (e) {
      console.warn('[TokenDropdown] loadTickerStats failed', e);
      statsError = 'Live market stats unavailable';
    } finally {
      statsLoading = false;
    }
  }

  function formatPrice(price: number | null, token: TokenDef) {
    if (!Number.isFinite(price as number)) return '—';
    const value = price as number;
    const decimals = value >= 1000 ? 2 : token.decimals;
    return value.toLocaleString('en-US', {
      minimumFractionDigits: Math.min(decimals, 2),
      maximumFractionDigits: Math.min(Math.max(decimals, 2), 8),
    });
  }

  function formatChange(change: number | null) {
    if (!Number.isFinite(change as number)) return '—';
    const value = change as number;
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  }

  function formatVolume(volume: number | null) {
    if (!Number.isFinite(volume as number) || (volume as number) <= 0) return '—';
    const value = volume as number;
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toFixed(0);
  }

  onMount(() => {
    updateViewportMode();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
  });

  onDestroy(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('scroll', handleViewportChange, true);
  });
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

<div class="tdd" class:compact>
  <button
    type="button"
    class="tdd-trigger"
    class:open
    bind:this={triggerEl}
    on:click|stopPropagation={toggleDropdown}
  >
    <span class="tdd-icon" style="color:{currentToken.color}">{currentToken.icon}</span>
    <span class="tdd-sym">{currentToken.symbol}</span>
    {#if !compact}
      <span class="tdd-name">{currentToken.name}</span>
    {/if}
    <span class="tdd-pair">/USDT</span>
    <span class="tdd-arrow">{open ? '▴' : '▾'}</span>
  </button>

  {#if open}
    <button
      type="button"
      class="tdd-backdrop"
      aria-label="Close market selector"
      on:click={closeDropdown}
    ></button>

    <div class="tdd-panel" class:mobile={isMobileSheet} style={isMobileSheet ? '' : panelStyle}>
      <div class="tdd-head">
        <div class="tdd-title-wrap">
          <div class="tdd-title">Market Selector</div>
          <div class="tdd-sub">Binance USDT Pairs</div>
        </div>
        <div class="tdd-head-actions">
          <button type="button" class="tdd-search-toggle" class:on={showSearch} on:click={toggleSearch}>
            {showSearch ? 'LIST' : 'SEARCH'}
          </button>
          <button type="button" class="tdd-close" on:click={closeDropdown}>✕</button>
        </div>
      </div>

      {#if showSearch}
        <div class="tdd-search-wrap">
          <input
            bind:this={searchEl}
            class="tdd-search"
            type="text"
            bind:value={filter}
            placeholder="Type symbol or name (optional)"
          />
        </div>
      {/if}

      <div class="tdd-tabs">
        {#each TAB_ORDER as tab}
          <button type="button" class="tdd-tab" class:active={activeTab === tab} on:click={() => (activeTab = tab)}>
            {TAB_LABELS[tab]}
          </button>
        {/each}
      </div>

      <div class="tdd-quick">
        <span class="tdd-quick-label">Quick</span>
        <div class="tdd-quick-list">
          {#each quickRows as row}
            <button
              type="button"
              class="tdd-quick-chip"
              class:active={row.token.symbol === currentSymbol}
              on:click={() => selectToken(row.token.symbol)}
            >
              {row.token.symbol}
            </button>
          {/each}
        </div>
      </div>

      <div class="tdd-head-row">
        <span>Market</span>
        <span class="r">Last Price</span>
        <span class="r">24h</span>
        <span class="r vol">Vol</span>
      </div>

      <div class="tdd-list">
        {#if statsLoading}
          <div class="tdd-hint">Loading live stats...</div>
        {:else if statsError}
          <div class="tdd-hint warn">{statsError}</div>
        {/if}

        {#if filteredRows.length === 0}
          <div class="tdd-empty">No market found for "{filter}"</div>
        {:else}
          {#each filteredRows as row}
            <button
              type="button"
              class="tdd-row"
              class:active={row.token.symbol === currentSymbol}
              on:click={() => selectToken(row.token.symbol)}
            >
              <span class="tdd-market">
                <span class="tdd-item-icon" style="color:{row.token.color}">{row.token.icon}</span>
                <span class="tdd-item-sym">{row.token.symbol}</span>
                <span class="tdd-item-pair">/USDT</span>
                <span class="tdd-item-name">{row.token.name}</span>
              </span>
              <span class="tdd-price r">{formatPrice(row.stats.price, row.token)}</span>
              <span class="tdd-change r" class:up={(row.stats.change24h ?? 0) >= 0} class:down={(row.stats.change24h ?? 0) < 0}>
                {formatChange(row.stats.change24h)}
              </span>
              <span class="tdd-vol r">{formatVolume(row.stats.quoteVolume)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .tdd {
    position: relative;
    z-index: 90;
  }

  .tdd-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 11px;
    border-radius: 8px;
    border: 1px solid rgba(240, 185, 11, 0.35);
    background: linear-gradient(180deg, rgba(33, 42, 58, 0.95), rgba(18, 24, 34, 0.96));
    color: #e6ebf5;
    font-family: var(--fm);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: border-color .14s ease, background .14s ease, color .14s ease;
    white-space: nowrap;
  }
  .tdd-trigger:hover {
    border-color: rgba(240, 185, 11, 0.72);
    color: #fff;
  }
  .tdd-trigger.open {
    border-color: #f0b90b;
    box-shadow: 0 0 0 1px rgba(240, 185, 11, 0.2);
  }
  .tdd-icon {
    font-size: 12px;
    line-height: 1;
  }
  .tdd-sym {
    font-family: var(--fd);
    font-size: 12px;
    font-weight: 900;
    letter-spacing: .6px;
    color: #ffd879;
  }
  .tdd-name {
    max-width: 82px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(200, 211, 227, 0.72);
    font-size: 8px;
    letter-spacing: .32px;
  }
  .tdd-pair {
    color: rgba(172, 183, 198, 0.76);
    font-size: 10px;
    letter-spacing: .25px;
  }
  .tdd-arrow {
    color: rgba(196, 207, 223, 0.76);
    font-size: 10px;
    margin-left: 2px;
  }

  .tdd.compact .tdd-trigger {
    height: 28px;
    padding: 0 10px;
    gap: 5px;
  }
  .tdd.compact .tdd-name {
    display: none;
  }

  .tdd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 4000;
    border: 0;
    background: rgba(7, 12, 18, 0.5);
  }

  .tdd-panel {
    position: fixed;
    z-index: 4001;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: linear-gradient(180deg, #121a2a 0%, #0d1320 100%);
    box-shadow: 0 18px 52px rgba(0, 0, 0, 0.52);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .tdd-panel.mobile {
    top: max(10px, env(safe-area-inset-top));
    left: 8px;
    right: 8px;
    bottom: calc(8px + env(safe-area-inset-bottom));
    width: auto;
    max-height: none;
    border-radius: 14px;
  }

  .tdd-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
  }
  .tdd-head-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .tdd-search-toggle {
    height: 24px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(224, 232, 244, 0.88);
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .58px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tdd-search-toggle.on {
    border-color: rgba(240, 185, 11, 0.7);
    background: rgba(240, 185, 11, 0.16);
    color: #ffe29a;
  }
  .tdd-search-toggle:hover {
    border-color: rgba(240, 185, 11, 0.62);
    background: rgba(240, 185, 11, 0.13);
    color: #fff;
  }
  .tdd-title {
    color: #f6f8fb;
    font-family: var(--fd);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .9px;
  }
  .tdd-sub {
    margin-top: 2px;
    color: rgba(173, 186, 204, 0.68);
    font-family: var(--fm);
    font-size: 8px;
    letter-spacing: .42px;
  }
  .tdd-close {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(224, 232, 244, 0.88);
    font-size: 11px;
    cursor: pointer;
  }
  .tdd-close:hover {
    border-color: rgba(240, 185, 11, 0.62);
    background: rgba(240, 185, 11, 0.13);
    color: #fff;
  }

  .tdd-search-wrap {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }
  .tdd-search {
    width: 100%;
    height: 34px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.04);
    color: #f3f6fb;
    font-family: var(--fm);
    font-size: 10px;
    padding: 0 11px;
    outline: none;
    box-sizing: border-box;
  }
  .tdd-search::placeholder {
    color: rgba(175, 187, 205, 0.6);
  }
  .tdd-search:focus {
    border-color: rgba(240, 185, 11, 0.72);
    box-shadow: 0 0 0 1px rgba(240, 185, 11, 0.24);
  }

  .tdd-tabs {
    display: flex;
    align-items: center;
    gap: 5px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }

  .tdd-quick {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    min-width: 0;
  }
  .tdd-quick-label {
    flex: 0 0 auto;
    color: rgba(168, 180, 197, 0.72);
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .42px;
    text-transform: uppercase;
  }
  .tdd-quick-list {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    padding-bottom: 1px;
  }
  .tdd-quick-list::-webkit-scrollbar {
    height: 4px;
  }
  .tdd-quick-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
  }
  .tdd-quick-chip {
    flex: 0 0 auto;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(222, 231, 244, 0.9);
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .58px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tdd-quick-chip:hover {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .tdd-quick-chip.active {
    border-color: rgba(240, 185, 11, 0.72);
    background: rgba(240, 185, 11, 0.16);
    color: #ffe29a;
  }
  .tdd-tabs::-webkit-scrollbar {
    height: 4px;
  }
  .tdd-tabs::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
  }
  .tdd-tab {
    flex: 0 0 auto;
    height: 24px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.17);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(207, 217, 232, 0.85);
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .68px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tdd-tab.active {
    border-color: rgba(240, 185, 11, 0.76);
    color: #ffe29a;
    background: rgba(240, 185, 11, 0.16);
  }

  .tdd-head-row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) 106px 68px 80px;
    gap: 8px;
    padding: 8px 12px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    color: rgba(168, 180, 197, 0.7);
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .42px;
  }

  .tdd-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 2px 6px 8px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  .tdd-list::-webkit-scrollbar {
    width: 5px;
  }
  .tdd-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
  }

  .tdd-hint {
    margin: 6px 6px 8px;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid rgba(104, 122, 146, 0.42);
    background: rgba(44, 55, 72, 0.28);
    color: rgba(177, 192, 212, 0.82);
    font-family: var(--fm);
    font-size: 8px;
    letter-spacing: .35px;
  }
  .tdd-hint.warn {
    border-color: rgba(255, 135, 135, 0.46);
    background: rgba(84, 25, 31, 0.32);
    color: rgba(255, 186, 186, 0.9);
  }
  .tdd-empty {
    padding: 16px 10px;
    text-align: center;
    color: rgba(171, 181, 196, 0.75);
    font-family: var(--fm);
    font-size: 9px;
  }

  .tdd-row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) 106px 68px 80px;
    gap: 8px;
    align-items: center;
    padding: 8px 6px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: rgba(228, 235, 247, 0.94);
    cursor: pointer;
    transition: border-color .12s ease, background .12s ease;
  }
  .tdd-row:hover {
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.04);
  }
  .tdd-row.active {
    border-color: rgba(240, 185, 11, 0.68);
    background: rgba(240, 185, 11, 0.12);
  }

  .tdd-market {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .tdd-item-icon {
    width: 14px;
    text-align: center;
    font-size: 11px;
    line-height: 1;
    flex: 0 0 14px;
  }
  .tdd-item-sym {
    font-family: var(--fd);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .65px;
    white-space: nowrap;
  }
  .tdd-item-pair {
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(173, 185, 201, 0.74);
    white-space: nowrap;
  }
  .tdd-item-name {
    margin-left: 3px;
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(163, 176, 196, 0.72);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .r {
    text-align: right;
    white-space: nowrap;
  }
  .tdd-price {
    font-family: var(--fd);
    font-size: 9px;
    color: #e7edf8;
  }
  .tdd-change {
    font-family: var(--fd);
    font-size: 9px;
    color: rgba(180, 191, 207, 0.88);
  }
  .tdd-change.up {
    color: #37d38d;
  }
  .tdd-change.down {
    color: #f56a7e;
  }
  .tdd-vol {
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(189, 199, 215, 0.84);
  }

  @media (max-width: 768px) {
    .tdd-trigger {
      height: 32px;
      padding: 0 10px;
      gap: 6px;
      border-radius: 9px;
    }
    .tdd-icon {
      font-size: 13px;
    }
    .tdd-sym {
      font-size: 13px;
    }
    .tdd-pair {
      font-size: 10px;
    }
    .tdd-arrow {
      font-size: 9px;
    }
    .tdd.compact .tdd-trigger {
      height: 30px;
      padding: 0 9px;
    }
  }

  @media (max-width: 640px) {
    .tdd-head-actions {
      gap: 5px;
    }
    .tdd-search-toggle {
      padding: 0 7px;
      font-size: 8px;
    }
    .tdd-head-row,
    .tdd-row {
      grid-template-columns: minmax(0, 1fr) 94px 64px;
      gap: 6px;
    }
    .tdd-head-row .vol,
    .tdd-vol {
      display: none;
    }
    .tdd-item-name {
      display: none;
    }
    .tdd-tab {
      height: 22px;
      font-size: 8px;
      padding: 0 7px;
    }
  }

  :global(.lobby) .tdd-trigger {
    background: #fff;
    color: #000;
    border: 2px solid #000;
    box-shadow: 2px 2px 0 #000;
  }
</style>
