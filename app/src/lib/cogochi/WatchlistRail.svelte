<script lang="ts">
  /**
   * WatchlistRail — TV-style left rail
   * - Top: hard-coded major pairs (clickable → switch chart symbol)
   * - Bottom: "내 패턴" section sourced from /api/patterns/terminal
   *
   * Data is intentionally minimal: this component does NOT own state for ticks
   * or quotes. It only emits a symbol-pick event upward via `onSelectSymbol`.
   */
  import { onMount } from 'svelte';

  interface PatternRow {
    slug: string;
    label: string;
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

  let myPatterns = $state<PatternRow[]>([]);
  let patternsLoading = $state(true);

  onMount(async () => {
    try {
      const r = await fetch('/api/patterns/terminal');
      if (r.ok) {
        const d = (await r.json()) as { patterns?: Array<{ slug?: string; label?: string }> };
        myPatterns = (d.patterns ?? [])
          .slice(0, 10)
          .map((p) => ({ slug: p.slug ?? '', label: p.label ?? p.slug ?? '' }))
          .filter((p) => p.slug.length > 0);
      }
    } catch {
      // silent — empty state is fine
    } finally {
      patternsLoading = false;
    }
  });

  function pick(symbol: string): void {
    onSelectSymbol?.(symbol);
  }

  function shortName(symbol: string): string {
    return symbol.replace(/USDT$/, '');
  }
</script>

<div class="rail">
  <div class="section-header">
    <span class="section-label">WATCHLIST</span>
    <span class="section-count">{SYMBOLS.length}</span>
  </div>
  <ul class="symbol-list">
    {#each SYMBOLS as sym (sym)}
      <li>
        <button
          type="button"
          class="symbol-row"
          class:active={sym === activeSymbol}
          onclick={() => pick(sym)}
        >
          <span class="sym-short">{shortName(sym)}</span>
          <span class="sym-quote">USDT</span>
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
          <div class="pattern-row" title={p.slug}>
            <span class="pattern-dot"></span>
            <span class="pattern-label">{p.label}</span>
          </div>
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

  .section-label {
    font-weight: 600;
  }

  .section-count {
    font-size: 8px;
    color: var(--g6);
  }

  .symbol-list,
  .pattern-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .symbol-row {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 5px 10px;
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

  .symbol-row:hover {
    background: var(--g2);
  }

  .symbol-row.active {
    background: var(--g3);
    color: var(--g9);
    border-left: 2px solid var(--brand);
    padding-left: 8px;
  }

  .sym-short {
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .sym-quote {
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.08em;
  }

  .pattern-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: 10px;
    color: var(--g7);
    border-bottom: 0.5px solid var(--g3);
  }

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
