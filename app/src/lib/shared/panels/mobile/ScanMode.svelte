<script lang="ts">
  /**
   * ScanMode — full-screen market list with filter chips.
   * Tapping a symbol switches to Chart mode with that symbol active.
   */

  import { mobileMode } from '$lib/stores/mobileMode';
  import { setActivePair } from '$lib/stores/activePairStore';
  import MobileEmptyState from './MobileEmptyState.svelte';

  interface MarketRow {
    symbol: string;
    base: string;
    price: number;
    changePct: number;
    volume24h?: number;
    bias?: 'bullish' | 'bearish' | 'neutral';
  }

  interface Props {
    rows?: MarketRow[];
    loading?: boolean;
    onRefresh?: () => void;
  }

  let { rows = [], loading = false, onRefresh }: Props = $props();

  type FilterChip = 'all' | 'bullish' | 'bearish' | 'volume';
  let activeFilter = $state<FilterChip>('all');

  const FILTER_CHIPS: { id: FilterChip; label: string }[] = [
    { id: 'all',     label: 'All' },
    { id: 'bullish', label: 'Rising' },
    { id: 'bearish', label: 'Falling' },
    { id: 'volume',  label: 'Volume' },
  ];

  const filteredRows = $derived((() => {
    if (activeFilter === 'all') return rows;
    if (activeFilter === 'bullish') return rows.filter(r => r.bias === 'bullish' || r.changePct > 0);
    if (activeFilter === 'bearish') return rows.filter(r => r.bias === 'bearish' || r.changePct < 0);
    if (activeFilter === 'volume') return [...rows].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    return rows;
  })());

  function selectSymbol(symbol: string) {
    setActivePair(symbol);
    mobileMode.setActive('chart', { symbol, tf: '1H' });
  }

  function fmtPrice(v: number) {
    if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (v >= 100) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  function fmtPct(v: number) {
    const s = v >= 0 ? '+' : '';
    return `${s}${v.toFixed(2)}%`;
  }
</script>

<div class="scan-mode">
  <!-- Filter chips -->
  <div class="filter-bar">
    {#each FILTER_CHIPS as chip}
      <button
        class="filter-chip"
        class:active={activeFilter === chip.id}
        onclick={() => (activeFilter = chip.id)}
      >
        {chip.label}
      </button>
    {/each}

    <button
      class="refresh-btn"
      onclick={onRefresh}
      disabled={loading}
      aria-label="Refresh"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    </button>
  </div>

  <!-- Market list -->
  <div class="market-list" role="list">
    {#if loading && filteredRows.length === 0}
      <MobileEmptyState
        icon="refresh"
        headline="Loading market data"
        subline="Please wait a moment."
        primaryCta={{
          label: 'Refresh',
          onClick: () => onRefresh?.(),
        }}
      />
    {:else if filteredRows.length === 0}
      <MobileEmptyState
        icon="search"
        headline="No symbols match the filter"
        subline="Change the filter or reload the full list."
        primaryCta={{
          label: 'Reset filter',
          onClick: () => { activeFilter = 'all'; },
        }}
        secondaryCta={{
          label: 'Refresh',
          onClick: () => onRefresh?.(),
        }}
      />
    {:else}
      {#each filteredRows as row (row.symbol)}
        <button
          class="market-row"
          onclick={() => selectSymbol(row.symbol)}
          aria-label="Select {row.base}"
        >
          <div class="row-left">
            <span class="row-base">{row.base}</span>
            <span class="row-symbol">{row.symbol}</span>
          </div>
          <div class="row-right">
            <span class="row-price">{fmtPrice(row.price)}</span>
            <span class="row-change" class:positive={row.changePct >= 0} class:negative={row.changePct < 0}>
              {fmtPct(row.changePct)}
            </span>
          </div>
          {#if row.bias}
            <span class="bias-dot bias-{row.bias}"></span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .scan-mode {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--sc-terminal-bg, #0a0c10);
  }

  /* Filter bar */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    flex-shrink: 0;
  }

  .filter-bar::-webkit-scrollbar { display: none; }

  .filter-chip {
    flex-shrink: 0;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: var(--sc-text-2, rgba(255,255,255,0.5));
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    min-height: 32px;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .filter-chip.active {
    background: rgba(77, 143, 245, 0.14);
    border-color: rgba(77, 143, 245, 0.3);
    color: var(--sc-text-0, rgba(247,242,234,0.98));
  }

  .refresh-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: var(--sc-text-2, rgba(255,255,255,0.5));
    cursor: pointer;
    flex-shrink: 0;
    margin-left: auto;
  }

  .refresh-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Market list */
  .market-list {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .market-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    cursor: pointer;
    text-align: left;
    /* 44pt touch target */
    min-height: 56px;
    transition: background 0.1s;
    position: relative;
  }

  .market-row:active {
    background: rgba(255, 255, 255, 0.04);
  }

  .row-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .row-base {
    font-family: var(--sc-font-mono);
    font-size: 14px;
    font-weight: 800;
    color: var(--sc-text-0, rgba(247,242,234,0.98));
    letter-spacing: -0.01em;
  }

  .row-symbol {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
    text-transform: uppercase;
  }

  .row-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .row-price {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--sc-text-0, rgba(247,242,234,0.98));
  }

  .row-change {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 600;
  }

  .row-change.positive { color: var(--sc-bias-bull); }
  .row-change.negative { color: var(--sc-bias-bear); }

  .bias-dot {
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 3px;
    border-radius: 50%;
  }

  .bias-bullish { background: var(--sc-bias-bull); }
  .bias-bearish { background: var(--sc-bias-bear); }
  .bias-neutral { background: var(--sc-text-3, rgba(255,255,255,0.3)); }
</style>
