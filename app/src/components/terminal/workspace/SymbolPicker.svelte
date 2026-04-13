<script lang="ts">
  import { onMount } from 'svelte';

  interface Token {
    rank: number;
    symbol: string;
    base: string;
    name: string;
    sector: string;
    price: number;
    pct_24h: number;
    vol_24h_usd: number;
    market_cap: number;
    oi_usd: number;
    is_futures: boolean;
    trending_score: number;
  }

  interface Props {
    activePair: string;
    onSelect: (pair: string) => void;
    onClose: () => void;
  }
  let { activePair, onSelect, onClose }: Props = $props();

  let tokens = $state<Token[]>([]);
  let loading = $state(true);
  let error = $state('');
  let query = $state('');
  let sector = $state('');
  let sort = $state('rank');
  let searchInput: HTMLInputElement;

  const sectors = ['', 'L1', 'DeFi', 'AI', 'Meme', 'Gaming', 'Infrastructure', 'RWA'];
  const sorts: { id: string; label: string }[] = [
    { id: 'rank', label: 'Rank' },
    { id: 'vol', label: 'Volume' },
    { id: 'trending', label: 'Hot' },
    { id: 'pct24h', label: '%Chg' },
  ];

  const activeBase = $derived(activePair.split('/')[0] ?? 'BTC');

  async function fetchTokens() {
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({ limit: '100', sort });
      if (sector) params.set('sector', sector);
      const res = await fetch(`/api/engine/universe?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      tokens = data.tokens ?? [];
    } catch (e: any) {
      error = e.message || 'Failed to load';
      tokens = [];
    } finally {
      loading = false;
    }
  }

  const filtered = $derived.by(() => {
    if (!query) return tokens;
    const q = query.toUpperCase();
    return tokens.filter(
      t => t.base.includes(q) || t.name.toUpperCase().includes(q) || t.symbol.includes(q)
    );
  });

  function selectToken(t: Token) {
    onSelect(`${t.base}/USDT`);
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function fmtPrice(p: number): string {
    if (p >= 1000) return p.toLocaleString('en', { maximumFractionDigits: 0 });
    if (p >= 1) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 0.01) return p.toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return p.toLocaleString('en', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  }

  function fmtVol(v: number): string {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
  }

  function fmtPct(p: number): string {
    const s = p >= 0 ? '+' : '';
    return `${s}${p.toFixed(2)}%`;
  }

  // Refetch when sort/sector changes
  $effect(() => {
    sort; sector;
    fetchTokens();
  });

  onMount(() => {
    searchInput?.focus();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="picker-backdrop" onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="picker-panel" onclick={(e) => e.stopPropagation()}>
    <!-- Search -->
    <div class="search-row">
      <input
        bind:this={searchInput}
        bind:value={query}
        type="text"
        class="search-input"
        placeholder="Search symbol or name…"
        spellcheck="false"
        autocomplete="off"
      />
    </div>

    <!-- Filters -->
    <div class="filter-row">
      <div class="sector-chips">
        {#each sectors as s}
          <button
            class="chip"
            class:active={sector === s}
            onclick={() => sector = s}
          >
            {s || 'All'}
          </button>
        {/each}
      </div>
      <div class="sort-chips">
        {#each sorts as s}
          <button
            class="chip sort-chip"
            class:active={sort === s.id}
            onclick={() => sort = s.id}
          >
            {s.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Header -->
    <div class="list-header">
      <span class="col-rank">#</span>
      <span class="col-symbol">Symbol</span>
      <span class="col-sector">Sector</span>
      <span class="col-price">Price</span>
      <span class="col-pct">24h</span>
      <span class="col-vol">Vol</span>
    </div>

    <!-- Token list -->
    <div class="list-body">
      {#if loading}
        <div class="list-msg">Loading…</div>
      {:else if error}
        <div class="list-msg list-error">{error}</div>
      {:else if filtered.length === 0}
        <div class="list-msg">No tokens found</div>
      {:else}
        {#each filtered as t (t.symbol)}
          <button
            class="token-row"
            class:selected={t.base === activeBase}
            onclick={() => selectToken(t)}
          >
            <span class="col-rank">{t.rank}</span>
            <span class="col-symbol">
              <span class="token-base">{t.base}</span>
              <span class="token-name">{t.name}</span>
            </span>
            <span class="col-sector">{t.sector}</span>
            <span class="col-price">{fmtPrice(t.price)}</span>
            <span class="col-pct" class:up={t.pct_24h >= 0} class:down={t.pct_24h < 0}>
              {fmtPct(t.pct_24h)}
            </span>
            <span class="col-vol">{fmtVol(t.vol_24h_usd)}</span>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .picker-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: var(--sc-z-dropdown, 150);
    display: flex; justify-content: center;
    padding-top: 56px;
  }
  .picker-panel {
    width: 560px; max-height: calc(100vh - 80px);
    background: var(--sc-bg-1, #0a0a0a);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    display: flex; flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  }

  /* Search */
  .search-row { padding: 10px 12px 6px; }
  .search-input {
    width: 100%; box-sizing: border-box;
    font-family: var(--sc-font-mono, monospace); font-size: 13px;
    color: var(--sc-text-0, #f7f2ea);
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px; padding: 7px 10px;
    outline: none;
  }
  .search-input::placeholder { color: var(--sc-text-3, rgba(247,242,234,0.4)); }
  .search-input:focus { border-color: rgba(255,255,255,0.2); }

  /* Filters */
  .filter-row {
    display: flex; gap: 8px; align-items: center;
    padding: 4px 12px 8px;
    flex-wrap: wrap;
  }
  .sector-chips, .sort-chips { display: flex; gap: 3px; }
  .sort-chips { margin-left: auto; }
  .chip {
    font-family: var(--sc-font-mono, monospace); font-size: 10px; font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--sc-text-2, rgba(247,242,234,0.58));
    background: none; border: 1px solid transparent;
    border-radius: 3px; padding: 2px 7px; cursor: pointer;
    transition: all 0.12s;
  }
  .chip:hover { color: var(--sc-text-0); background: rgba(255,255,255,0.05); }
  .chip.active {
    color: var(--sc-text-0, #f7f2ea);
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.12);
  }

  /* List header */
  .list-header {
    display: grid;
    grid-template-columns: 36px 1fr 64px 80px 64px 64px;
    gap: 4px; padding: 4px 12px;
    font-family: var(--sc-font-mono, monospace); font-size: 10px;
    color: var(--sc-text-3, rgba(247,242,234,0.4));
    text-transform: uppercase; letter-spacing: 0.08em;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .col-price, .col-pct, .col-vol { text-align: right; }

  /* List body */
  .list-body {
    overflow-y: auto; flex: 1;
    min-height: 120px; max-height: 420px;
  }
  .list-body::-webkit-scrollbar { width: 4px; }
  .list-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

  .list-msg {
    padding: 24px; text-align: center;
    font-family: var(--sc-font-mono, monospace); font-size: 12px;
    color: var(--sc-text-2);
  }
  .list-error { color: var(--sc-bad, #f87171); }

  /* Token row */
  .token-row {
    display: grid;
    grid-template-columns: 36px 1fr 64px 80px 64px 64px;
    gap: 4px; padding: 6px 12px;
    width: 100%; text-align: left;
    background: none; border: none; cursor: pointer;
    font-family: var(--sc-font-mono, monospace);
    transition: background 0.1s;
  }
  .token-row:hover { background: rgba(255,255,255,0.04); }
  .token-row.selected { background: rgba(255,255,255,0.06); }

  .col-rank { font-size: 10px; color: var(--sc-text-3); align-self: center; }

  .col-symbol { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
  .token-base { font-size: 12px; font-weight: 700; color: var(--sc-text-0); }
  .token-name {
    font-size: 10px; color: var(--sc-text-3);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .col-sector {
    font-size: 10px; color: var(--sc-text-2); align-self: center;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .col-price {
    font-size: 12px; color: var(--sc-text-1, rgba(247,242,234,0.84));
    text-align: right; align-self: center;
  }
  .col-pct {
    font-size: 11px; font-weight: 600; text-align: right; align-self: center;
  }
  .col-pct.up { color: var(--sc-good, #4ade80); }
  .col-pct.down { color: var(--sc-bad, #f87171); }

  .col-vol {
    font-size: 10px; color: var(--sc-text-2); text-align: right; align-self: center;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .picker-panel { width: calc(100vw - 16px); margin: 0 8px; }
    .list-header, .token-row {
      grid-template-columns: 28px 1fr 56px 56px;
    }
    .col-sector, .col-vol { display: none; }
  }
</style>
