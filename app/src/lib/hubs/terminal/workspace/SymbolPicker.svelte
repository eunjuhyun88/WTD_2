<script lang="ts">
  import { onMount } from 'svelte';
  import { TOKENS, TOKEN_CATEGORIES } from '$lib/data/tokens';
  import Sparkline from './Sparkline.svelte';

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

  interface SparklineData {
    prices: number[];
    high: number;
    low: number;
    volume: number;
  }

  interface Props {
    activePair: string;
    onSelect: (pair: string) => void;
    onClose: () => void;
  }
  let { activePair, onSelect, onClose }: Props = $props();

  let tokens = $state<Token[]>([]);
  let sparklines = $state<Record<string, SparklineData>>({});
  let loading = $state(true);
  let error = $state('');
  let usingFallback = $state(false);
  let query = $state('');
  let sector = $state('');
  let sort = $state('rank');
  let searchInput: HTMLInputElement;
  let fetchRequestId = 0;

  const UNIVERSE_LIMIT = 500;
  const sectors: Array<{ label: string; value: string }> = [
    { label: 'All', value: '' },
    { label: 'L1', value: 'L1' },
    { label: 'DeFi', value: 'DeFi' },
    { label: 'AI', value: 'AI' },
    { label: 'Meme', value: 'Meme' },
    { label: 'Gaming', value: 'Gaming' },
    { label: 'Infrastructure', value: 'Infra' },
    { label: 'RWA', value: 'RWA' },
  ];
  const sorts: { id: string; label: string }[] = [
    { id: 'rank', label: 'Rank' },
    { id: 'vol', label: 'Volume' },
    { id: 'trending', label: 'Hot' },
    { id: 'pct24h', label: '%Chg' },
  ];

  const activeBase = $derived(activePair.split('/')[0] ?? 'BTC');

  function tokenSector(base: string): string {
    if (TOKEN_CATEGORIES.major.includes(base) || TOKEN_CATEGORIES.l1l2.includes(base)) return 'L1';
    if (TOKEN_CATEGORIES.defi.includes(base)) return 'DeFi';
    if (TOKEN_CATEGORIES.meme.includes(base)) return 'Meme';
    if (['FET', 'RNDR', 'GRT'].includes(base)) return 'AI';
    if (TOKEN_CATEGORIES.ai_gaming.includes(base)) return 'Gaming';
    if (TOKEN_CATEGORIES.infra.includes(base)) return 'Infra';
    return 'Other';
  }

  function filterAndSortTokens(input: Token[]): Token[] {
    const filteredTokens = sector ? input.filter((token) => token.sector === sector) : input.slice();
    switch (sort) {
      case 'vol':
        return filteredTokens.sort((a, b) => b.vol_24h_usd - a.vol_24h_usd || a.rank - b.rank);
      case 'trending':
        return filteredTokens.sort((a, b) => b.trending_score - a.trending_score || a.rank - b.rank);
      case 'pct24h':
        return filteredTokens.sort((a, b) => b.pct_24h - a.pct_24h || a.rank - b.rank);
      case 'rank':
      default:
        return filteredTokens.sort((a, b) => a.rank - b.rank);
    }
  }

  async function loadFallbackTokens() {
    const marketBySymbol = new Map<string, {
      rank: number;
      price: number;
      change24h: number;
      volume24h: number;
      marketCap: number;
      trendingScore: number;
    }>();

    try {
      const res = await fetch('/api/market/trending?limit=40');
      if (res.ok) {
        const raw = await res.json();
        const payload = raw?.data ?? raw;
        const sections = [payload?.trending ?? [], payload?.gainers ?? [], payload?.losers ?? []];
        for (const section of sections) {
          for (const row of section) {
            const symbol = String(row?.symbol ?? '').toUpperCase();
            if (!symbol || marketBySymbol.has(symbol)) continue;
            marketBySymbol.set(symbol, {
              rank: Number(row?.rank ?? Number.MAX_SAFE_INTEGER),
              price: Number(row?.price ?? 0),
              change24h: Number(row?.change24h ?? 0),
              volume24h: Number(row?.volume24h ?? 0),
              marketCap: Number(row?.marketCap ?? 0),
              trendingScore: Number(row?.galaxyScore ?? row?.socialVolume ?? row?.rank ?? 0),
            });
          }
        }
      }
    } catch {
      // Fallback registry is intentionally local-first.
    }

    const fallbackTokens = TOKENS.map((token, index) => {
      const market = marketBySymbol.get(token.symbol);
      return {
        rank: market?.rank ?? index + 1,
        symbol: token.binanceSymbol,
        base: token.symbol,
        name: token.name,
        sector: tokenSector(token.symbol),
        price: market?.price ?? 0,
        pct_24h: market?.change24h ?? 0,
        vol_24h_usd: market?.volume24h ?? 0,
        market_cap: market?.marketCap ?? 0,
        oi_usd: 0,
        is_futures: true,
        trending_score: market?.trendingScore ?? 0,
      } satisfies Token;
    });

    tokens = filterAndSortTokens(fallbackTokens);
    usingFallback = true;
    error = '';
    if (tokens.length > 0) {
      fetchSparklines(tokens.slice(0, 20).map((token) => token.symbol));
    }
  }

  async function fetchTokens() {
    const requestId = ++fetchRequestId;
    const searchQuery = query.trim();
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({
        limit: String(searchQuery ? Math.min(UNIVERSE_LIMIT, 50) : UNIVERSE_LIMIT),
        sort,
      });
      if (sector) params.set('sector', sector);
      if (searchQuery) params.set('q', searchQuery);
      const res = await fetch(`/api/engine/universe?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (requestId !== fetchRequestId) return;
      tokens = data.tokens ?? [];
      usingFallback = false;

      // Fetch sparklines for top 20 tokens
      const sparklineSymbols = tokens.filter((token) => token.is_futures).slice(0, 20).map((token) => token.symbol);
      if (sparklineSymbols.length > 0) {
        fetchSparklines(sparklineSymbols);
      }
    } catch (e: any) {
      await loadFallbackTokens();
      if (requestId !== fetchRequestId) return;
      if (tokens.length === 0) {
        error = e.message || 'Failed to load';
      }
    } finally {
      if (requestId === fetchRequestId) {
        loading = false;
      }
    }
  }

  async function fetchSparklines(symbols: string[]) {
    try {
      const res = await fetch(`/api/market/sparklines?symbols=${symbols.join(',')}`);
      if (!res.ok) return;
      const data = await res.json();
      sparklines = data.sparklines ?? {};
    } catch {
      // sparklines are optional, fail silently
    }
  }

  const filtered = $derived.by(() => {
    if (!query || !usingFallback) return tokens;
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

  function fmtMcap(v: number): string {
    if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${(v / 1e3).toFixed(0)}K`;
  }

  // Refetch when sort/sector changes
  $effect(() => {
    sort; sector; query;
    const delayMs = query.trim() ? 150 : 0;
    const timer = setTimeout(() => {
      void fetchTokens();
    }, delayMs);
    return () => clearTimeout(timer);
  });

  onMount(() => {
    searchInput?.focus();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="picker-shell" role="presentation">
  <button class="picker-backdrop" type="button" aria-label="Close symbol picker" onclick={onClose}></button>
  <div class="picker-panel" role="dialog" aria-modal="true" aria-label="Symbol picker" tabindex="-1">
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
        {#each sectors as item}
          <button
            class="chip"
            class:active={sector === item.value}
            onclick={() => sector = item.value}
          >
            {item.label}
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

    {#if usingFallback}
      <div class="fallback-note">Engine universe unavailable. Showing local symbol registry.</div>
    {/if}

    <!-- Header -->
    <div class="list-header">
      <span class="col-rank">#</span>
      <span class="col-info">Symbol</span>
      <span class="col-chart">24h</span>
      <span class="col-price">Price</span>
      <span class="col-metrics">Chg / Vol</span>
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
          {@const spark = sparklines[t.symbol]}
          <button
            class="token-row"
            class:selected={t.base === activeBase}
            onclick={() => selectToken(t)}
          >
            <!-- Rank -->
            <span class="col-rank">{t.rank}</span>

            <!-- Symbol + Name + Sector badge -->
            <div class="col-info">
              <div class="info-top">
                <span class="token-base">{t.base}</span>
                {#if t.sector && t.sector !== 'Other'}
                  <span class="sector-badge">{t.sector}</span>
                {/if}
              </div>
              <span class="token-name">{t.name}</span>
            </div>

            <!-- Sparkline chart -->
            <div class="col-chart">
              {#if spark?.prices}
                <Sparkline prices={spark.prices} width={72} height={24} positive={t.pct_24h >= 0} />
              {:else}
                <div class="spark-placeholder"></div>
              {/if}
            </div>

            <!-- Price -->
            <span class="col-price">{fmtPrice(t.price)}</span>

            <!-- Change + Volume + MCap -->
            <div class="col-metrics">
              <span class="metric-pct" class:up={t.pct_24h >= 0} class:down={t.pct_24h < 0}>
                {fmtPct(t.pct_24h)}
              </span>
              <span class="metric-sub">V {fmtVol(t.vol_24h_usd)}</span>
              {#if t.market_cap > 0}
                <span class="metric-sub">MC {fmtMcap(t.market_cap)}</span>
              {/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .picker-shell {
    position: fixed;
    inset: 0;
    z-index: var(--sc-z-dropdown, 150);
    display: flex;
    justify-content: center;
    padding-top: 56px;
  }

  .picker-backdrop {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.55);
    border: none;
    padding: 0;
    margin: 0;
  }
  .picker-panel {
    width: 620px; max-height: calc(100vh - 80px);
    background: var(--sc-bg-1, #0a0a0a);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    display: flex; flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 48px rgba(0,0,0,0.6);
    position: relative;
    z-index: 1;
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
  .fallback-note {
    margin: 0 16px 10px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(99, 179, 237, 0.18);
    background: rgba(99, 179, 237, 0.08);
    color: rgba(235, 244, 255, 0.82);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .sector-chips, .sort-chips { display: flex; gap: 3px; }
  .sort-chips { margin-left: auto; }
  .chip {
    font-family: var(--sc-font-mono, monospace); font-size: var(--ui-text-xs); font-weight: 600;
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
    grid-template-columns: 32px 1fr 80px 80px 88px;
    gap: 6px; padding: 5px 12px;
    font-family: var(--sc-font-mono, monospace); font-size: var(--ui-text-xs);
    color: var(--sc-text-3, rgba(247,242,234,0.4));
    text-transform: uppercase; letter-spacing: 0.08em;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .list-header .col-price, .list-header .col-metrics { text-align: right; }

  /* List body */
  .list-body {
    overflow-y: auto; flex: 1;
    min-height: 120px; max-height: 480px;
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
    grid-template-columns: 32px 1fr 80px 80px 88px;
    gap: 6px; padding: 7px 12px;
    width: 100%; text-align: left;
    background: none; border: none; border-bottom: 1px solid rgba(255,255,255,0.03);
    cursor: pointer;
    font-family: var(--sc-font-mono, monospace);
    transition: background 0.1s;
  }
  .token-row:hover { background: rgba(255,255,255,0.04); }
  .token-row.selected { background: rgba(255,255,255,0.06); border-left: 2px solid var(--sc-accent, #db9a9f); }

  .col-rank { font-size: var(--ui-text-xs); color: var(--sc-text-3); align-self: center; text-align: center; }

  /* Symbol info */
  .col-info { display: flex; flex-direction: column; gap: 2px; overflow: hidden; justify-content: center; }
  .info-top { display: flex; align-items: center; gap: 5px; }
  .token-base { font-size: 12px; font-weight: 700; color: var(--sc-text-0); }
  .sector-badge {
    font-size: var(--ui-text-xs); font-weight: 700; letter-spacing: 0.05em;
    color: rgba(167,139,250,0.9); /* violet */
    background: rgba(167,139,250,0.1);
    border: 1px solid rgba(167,139,250,0.2);
    border-radius: 2px; padding: 1px 4px;
    text-transform: uppercase;
  }
  .token-name {
    font-size: var(--ui-text-xs); color: var(--sc-text-3);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* Sparkline column */
  .col-chart { align-self: center; display: flex; align-items: center; justify-content: center; }
  .spark-placeholder {
    width: 72px; height: 24px;
    background: rgba(255,255,255,0.02);
    border-radius: 2px;
  }

  /* Price */
  .col-price {
    font-size: 12px; color: var(--sc-text-1, rgba(247,242,234,0.84));
    text-align: right; align-self: center;
  }

  /* Metrics column */
  .col-metrics {
    display: flex; flex-direction: column; gap: 1px;
    text-align: right; align-self: center;
  }
  .metric-pct { font-size: 11px; font-weight: 700; }
  .metric-pct.up { color: var(--sc-good, #4ade80); }
  .metric-pct.down { color: var(--sc-bad, #f87171); }
  .metric-sub { font-size: var(--ui-text-xs); color: var(--sc-text-3); }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .picker-panel { width: calc(100vw - 16px); margin: 0 8px; }
    .list-header, .token-row {
      grid-template-columns: 28px 1fr 64px 64px;
    }
    .col-chart { display: none; }
    .metric-sub { display: none; }
  }
</style>
