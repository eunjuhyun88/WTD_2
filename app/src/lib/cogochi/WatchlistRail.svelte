<script lang="ts">
  /**
   * WatchlistRail — TV-style left rail
   * - Top: major pairs with live price + 24h% (Binance miniTicker WebSocket ~1s)
   * - Bottom: "내 패턴" section sourced from /api/patterns/terminal
   *
   * Real-time feed: subscribeMiniTicker opens a single multi-stream WS for all
   * SYMBOLS. Updates arrive ~1s apart (Binance push cadence).
   */
  import { onMount, onDestroy } from 'svelte';
  import { subscribeMiniTicker, type MiniTickerUpdate } from '$lib/api/binance';

  interface PatternRow {
    slug: string;
    label: string;
    symbol?: string;
  }

  interface Props {
    activeSymbol?: string;
    onSelectSymbol?: (symbol: string) => void;
  }

  let { activeSymbol = 'BTCUSDT', onSelectSymbol }: Props = $props();

  const SYMBOLS: readonly string[] = [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'BNBUSDT',
    'XRPUSDT',
    'AVAXUSDT',
    'DOGEUSDT',
  ];

  // Live tick state per symbol: price + 24h change %
  let ticks = $state<Record<string, MiniTickerUpdate>>({});
  // 7-bar sparkline: circular buffer of close prices per symbol
  let sparkData = $state<Record<string, number[]>>({});

  let myPatterns = $state<PatternRow[]>([]);
  let patternsLoading = $state(true);

  let unsubscribe: (() => void) | null = null;

  onMount(async () => {
    // Real-time price feed
    unsubscribe = subscribeMiniTicker(
      [...SYMBOLS],
      () => {},
      (updates) => {
        ticks = { ...ticks, ...updates };
        // Update sparkline buffers
        const next: Record<string, number[]> = { ...sparkData };
        for (const [sym, tick] of Object.entries(updates)) {
          const prev = next[sym] ?? [];
          next[sym] = [...prev.slice(-6), tick.price];
        }
        sparkData = next;
      },
    );

    // My patterns (one-shot)
    try {
      const r = await fetch('/api/patterns/terminal');
      if (r.ok) {
        const d = (await r.json()) as { patterns?: Array<{ slug?: string; label?: string; symbol?: string }> };
        myPatterns = (d.patterns ?? [])
          .slice(0, 10)
          .map((p) => ({ slug: p.slug ?? '', label: p.label ?? p.slug ?? '', symbol: p.symbol }))
          .filter((p) => p.slug.length > 0);
      }
    } catch {
      // silent — empty state is fine
    } finally {
      patternsLoading = false;
    }
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  function pick(symbol: string): void {
    onSelectSymbol?.(symbol);
  }

  function shortName(symbol: string): string {
    return symbol.replace(/USDT$/, '');
  }

  function fmtPrice(p: number): string {
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    return p.toPrecision(4);
  }

  function fmtChange(c: number): string {
    return (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
  }

  function sparkPolyline(prices: number[]): string {
    const W = 30, H = 14;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    return prices
      .map((p, i) => {
        const x = (i / (prices.length - 1)) * W;
        const y = H - ((p - min) / range) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
</script>

<div class="rail">
  <div class="section-header">
    <span class="section-label">WATCHLIST</span>
    <span class="section-count">{SYMBOLS.length}</span>
  </div>
  <ul class="symbol-list">
    {#each SYMBOLS as sym (sym)}
      {@const tick = ticks[sym]}
      {@const spark = sparkData[sym] ?? []}
      <li>
        <button
          type="button"
          class="symbol-row"
          class:active={sym === activeSymbol}
          onclick={() => pick(sym)}
        >
          <span class="sym-name">{shortName(sym)}</span>
          <span class="sym-right">
            {#if tick}
              <span class="sym-price">{fmtPrice(tick.price)}</span>
              <span class="sym-bottom">
                <span
                  class="sym-change"
                  class:up={tick.change24h >= 0}
                  class:dn={tick.change24h < 0}
                >{fmtChange(tick.change24h)}</span>
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
        </button>
      </li>
    {/each}
  </ul>

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
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px 4px;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--g4);
    background: var(--g0);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .section-label { font-weight: 600; }
  .section-count { font-size: 8px; color: var(--g6); }

  .symbol-list,
  .pattern-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

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

  .symbol-row.active {
    background: var(--g3);
    color: var(--g9);
    border-left: 2px solid var(--brand);
    padding-left: 8px;
  }

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
    font-size: 10px;
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
    font-size: 8px;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
  }
  .sym-change.up { color: #22AB94; }
  .sym-change.dn { color: #F23645; }

  .sparkline {
    display: block;
    flex-shrink: 0;
  }

  .sym-loading {
    font-size: 9px;
    color: var(--g5);
    animation: blink 1.2s infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
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
</style>
