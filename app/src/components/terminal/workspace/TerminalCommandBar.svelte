<script lang="ts">
  import { canonicalSymbol, canonicalChange24h, terminalState } from '$lib/stores/terminalState';
  import SymbolPicker from './SymbolPicker.svelte';
  import IndicatorLibrary from './IndicatorLibrary.svelte';
  import PineScriptGenerator from './PineScriptGenerator.svelte';

  interface Props {
    assetsCount?: number;
    marketRailOpen?: boolean;
    onToggleMarketRail?: () => void;
    price?: number | null;
    change24h?: number | null;
    mode?: 'observe' | 'analyze' | 'execute';
    onModeChange?: (mode: string) => void;
  }

  let {
    assetsCount = 0,
    marketRailOpen = false,
    onToggleMarketRail,
    price = null,
    change24h = null,
    mode = 'analyze',
    onModeChange,
  }: Props = $props();

  const displayChange = $derived(change24h ?? $canonicalChange24h);

  let showSymbolDrop = $state(false);
  let showIndicatorLib = $state(false);
  let showPineGen = $state(false);

  function fmtPrice(p: number): string {
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1000)  return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1)     return p.toFixed(4);
    return p.toPrecision(4);
  }

  function handleSymbolSelect(pair: string) {
    // Extract symbol from BTC/USDT format
    const base = pair.split('/')[0] ?? 'BTC';
    terminalState.setSymbol(`${base}USDT`);
    showSymbolDrop = false;
  }
</script>

<nav class="cmd-bar" aria-label="Terminal command bar">
  <!-- Symbol ticker — most prominent element -->
  <button class="ticker-btn" type="button" onclick={() => showSymbolDrop = !showSymbolDrop}>
    <span class="ticker-pair">{$canonicalSymbol?.slice(0, -4) ?? 'BTC'}</span>
    <span class="ticker-quote">/USDT</span>
    <span class="ticker-caret">▾</span>
  </button>

  <!-- Live price -->
  {#if price != null}
    <div class="ticker-price">
      <span class="price-num">{fmtPrice(price)}</span>
      {#if displayChange != null}
        <span class="price-delta" class:up={displayChange >= 0} class:dn={displayChange < 0}>
          {displayChange >= 0 ? '▲' : '▼'}{Math.abs(displayChange).toFixed(2)}%
        </span>
      {/if}
    </div>
  {/if}

  <div class="cmd-spacer" aria-hidden="true"></div>

  <!-- Mode pill: Observe / Analyze / Execute -->
  <div class="mode-pill" role="group" aria-label="Terminal mode">
    {#each (['observe', 'analyze', 'execute'] as const) as m}
      <button
        class="mode-seg"
        class:mode-seg--active={mode === m}
        class:mode-seg--observe={m === 'observe' && mode === 'observe'}
        class:mode-seg--execute={m === 'execute' && mode === 'execute'}
        onclick={() => onModeChange?.(m)}
        aria-pressed={mode === m}
      >{m.toUpperCase()}</button>
    {/each}
  </div>

  <!-- Pine Script Generator -->
  <button
    class="cmd-btn cmd-btn--pine"
    class:cmd-btn--active={showPineGen}
    type="button"
    onclick={() => showPineGen = !showPineGen}
    aria-label="Pine Script Generator"
    title="자연어 → Pine Script"
  >
    <span style="font-size:11px">⌥</span>
    <span>Script</span>
  </button>

  <!-- Indicators -->
  <button
    class="cmd-btn"
    class:cmd-btn--active={showIndicatorLib}
    type="button"
    onclick={() => showIndicatorLib = !showIndicatorLib}
    aria-label="Indicator Library"
  >
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
    <span>Indicators</span>
  </button>

  <!-- Markets toggle -->
  <button
    class="markets-btn"
    class:open={marketRailOpen}
    type="button"
    onclick={() => onToggleMarketRail?.()}
    aria-pressed={marketRailOpen}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
    <span class="markets-label">Markets</span>
  </button>
</nav>

<IndicatorLibrary
  open={showIndicatorLib}
  onClose={() => showIndicatorLib = false}
/>

<PineScriptGenerator
  open={showPineGen}
  onClose={() => showPineGen = false}
/>

{#if showSymbolDrop}
  <SymbolPicker
    activePair={($canonicalSymbol?.slice(0, -4) ?? 'BTC') + '/USDT'}
    onSelect={handleSymbolSelect}
    onClose={() => showSymbolDrop = false}
  />
{/if}

<style>
  .cmd-bar {
    display: flex;
    align-items: center;
    gap: 0;
    height: 42px;
    padding: 0 12px;
    background: var(--tv-bg-1, #131722);
    border-bottom: 1px solid var(--tv-border, rgba(255,255,255,0.055));
    overflow-x: auto;
    scrollbar-width: none;
  }
  .cmd-bar::-webkit-scrollbar { display: none; }

  /* Symbol ticker */
  .ticker-btn {
    display: inline-flex;
    align-items: baseline;
    gap: 0;
    padding: 6px 10px 6px 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--sc-font-mono, 'IBM Plex Mono', monospace);
    flex-shrink: 0;
    margin-right: 12px;
  }
  .ticker-btn:hover .ticker-pair { color: #fff; }

  .ticker-pair {
    font-size: 15px;
    font-weight: 700;
    color: var(--tv-text-0, #D1D4DC);
    letter-spacing: -0.01em;
    transition: color 100ms;
  }
  .ticker-quote {
    font-size: 11px;
    font-weight: 400;
    color: var(--tv-text-2, rgba(209,212,220,0.4));
    margin-left: 1px;
  }
  .ticker-caret {
    font-size: 9px;
    color: var(--tv-text-2, rgba(209,212,220,0.4));
    margin-left: 4px;
    transition: color 100ms;
  }
  .ticker-btn:hover .ticker-caret { color: var(--tv-text-1); }

  /* Price */
  .ticker-price {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    flex-shrink: 0;
    font-family: var(--sc-font-mono, 'IBM Plex Mono', monospace);
    margin-right: 16px;
  }
  .price-num {
    font-size: 14px;
    font-weight: 600;
    color: var(--tv-text-0, #D1D4DC);
    letter-spacing: 0.01em;
  }
  .price-delta {
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .price-delta.up { color: var(--tv-green, #22AB94); }
  .price-delta.dn { color: var(--tv-red, #F23645); }

  /* Spacer */
  .cmd-spacer { flex: 1 1 auto; min-width: 8px; }

  /* Mode pill */
  .mode-pill {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--tv-border, rgba(255,255,255,0.055));
    border-radius: 5px;
    overflow: hidden;
    margin-right: 8px;
    flex-shrink: 0;
  }
  .mode-seg {
    padding: 4px 9px;
    font-family: var(--sc-font-mono, 'IBM Plex Mono', monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    background: transparent;
    border: none;
    border-right: 1px solid var(--tv-border, rgba(255,255,255,0.055));
    color: rgba(209,212,220,0.38);
    cursor: pointer;
    transition: background 100ms, color 100ms;
    white-space: nowrap;
  }
  .mode-seg:last-child { border-right: none; }
  .mode-seg:hover { background: rgba(255,255,255,0.04); color: rgba(209,212,220,0.72); }
  .mode-seg--active { background: rgba(255,255,255,0.07); color: rgba(209,212,220,0.92); }
  .mode-seg--observe.mode-seg--active { background: rgba(99,179,237,0.09); color: #63b3ed; }
  .mode-seg--execute.mode-seg--active { background: rgba(74,222,128,0.09); color: #4ade80; }

  /* Shared cmd button (Indicators, future buttons) */
  .cmd-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    margin-right: 6px;
    border-radius: 4px;
    border: 1px solid var(--tv-border, rgba(255,255,255,0.055));
    background: rgba(255,255,255,0.025);
    color: var(--tv-text-1, rgba(209,212,220,0.72));
    font-family: var(--sc-font-mono, 'IBM Plex Mono', monospace);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 100ms, border-color 100ms, color 100ms;
    flex-shrink: 0;
  }
  .cmd-btn:hover {
    background: rgba(255,255,255,0.06);
    color: var(--tv-text-0, #D1D4DC);
    border-color: rgba(255,255,255,0.11);
  }
  .cmd-btn--active {
    background: rgba(34,171,148,0.10);
    border-color: rgba(34,171,148,0.28);
    color: #22AB94;
  }
  .cmd-btn--pine.cmd-btn--active {
    background: rgba(255,199,80,0.10);
    border-color: rgba(255,199,80,0.30);
    color: #ffc750;
  }

  /* Markets button */
  .markets-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border-radius: 4px;
    border: 1px solid var(--tv-border, rgba(255,255,255,0.055));
    background: rgba(255,255,255,0.025);
    color: var(--tv-text-1, rgba(209,212,220,0.72));
    font-family: var(--sc-font-mono, 'IBM Plex Mono', monospace);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 100ms, border-color 100ms, color 100ms;
    flex-shrink: 0;
  }
  .markets-btn:hover {
    background: rgba(255,255,255,0.06);
    color: var(--tv-text-0);
    border-color: var(--tv-border-strong);
  }
  .markets-btn.open {
    background: rgba(75,158,253,0.10);
    border-color: rgba(75,158,253,0.3);
    color: var(--tv-blue, #4B9EFD);
  }
  .markets-label { font-size: 10px; }

  @media (max-width: 767px) {
    .cmd-bar { height: 38px; padding: 0 8px; }
    .ticker-pair { font-size: 13px; }
    .ticker-price { display: none; }
    .markets-label { display: none; }
  }
</style>
