<script lang="ts">
  import { activePair, setActivePair } from '$lib/stores/activePairStore';
  import SymbolPicker from './SymbolPicker.svelte';

  interface Props {
    assetsCount?: number;
    marketRailOpen?: boolean;
    onToggleMarketRail?: () => void;
    tf?: string;
    onTfChange?: (tf: string) => void;
    price?: number | null;
    change24h?: number | null;
  }

  let {
    assetsCount = 0,
    marketRailOpen = false,
    onToggleMarketRail,
    tf = '4h',
    onTfChange,
    price = null,
    change24h = null,
  }: Props = $props();

  let showSymbolDrop = $state(false);

  const TF_LIST = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

  function normTf(t: string) {
    return t.toLowerCase();
  }

  function fmtPrice(p: number): string {
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1000)  return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1)     return p.toFixed(4);
    return p.toPrecision(4);
  }
</script>

<nav class="command-bar" aria-label="Terminal command bar">
  <!-- Symbol chip -->
  <button
    class="sym-chip"
    type="button"
    title={assetsCount > 1 ? `${assetsCount} active assets in scan context` : '심볼 변경'}
    onclick={() => showSymbolDrop = !showSymbolDrop}
  >
    <span class="sym-kicker">SYMBOL</span>
    <strong class="sym-value">{$activePair || 'BTC/USDT'}</strong>
    <span class="sym-caret" aria-hidden="true">▾</span>
  </button>

  <!-- Price + change -->
  {#if price != null}
    <div class="price-block">
      <span class="price-val">{fmtPrice(price)}</span>
      {#if change24h != null}
        <span class="price-chg" class:up={change24h >= 0} class:dn={change24h < 0}>
          {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
        </span>
      {/if}
    </div>
  {/if}

  <span class="bar-sep" aria-hidden="true"></span>

  <!-- Timeframe selector -->
  <div class="tf-row" role="group" aria-label="Timeframe">
    {#each TF_LIST as t}
      <button
        class="tf-btn"
        class:active={normTf(tf) === normTf(t)}
        type="button"
        onclick={() => onTfChange?.(t)}
      >{t.toUpperCase()}</button>
    {/each}
  </div>

  <span class="bar-spacer" aria-hidden="true"></span>

  <!-- Markets toggle -->
  <button
    class="rail-toggle"
    type="button"
    onclick={() => onToggleMarketRail?.()}
    aria-pressed={marketRailOpen}
    title="Market list"
  >
    <span class="rail-kicker">MARKETS</span>
    <span class="rail-state">{marketRailOpen ? '●' : '○'}</span>
  </button>
</nav>

{#if showSymbolDrop}
  <SymbolPicker
    activePair={$activePair || 'BTC/USDT'}
    onSelect={(pair) => setActivePair(pair)}
    onClose={() => showSymbolDrop = false}
  />
{/if}

<style>
  .command-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: transparent;
    min-height: 36px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .command-bar::-webkit-scrollbar { display: none; }

  /* ── Symbol chip ── */
  .sym-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    padding: 3px 8px;
    border-radius: var(--sc-radius-1, 2px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.028);
    color: var(--sc-text-0);
    cursor: pointer;
    transition: background var(--sc-dur-fast, 140ms) ease, border-color var(--sc-dur-fast, 140ms) ease;
    font-family: var(--sc-font-mono);
    flex-shrink: 0;
  }
  .sym-chip:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.14);
  }
  .sym-kicker {
    font-size: 8px;
    letter-spacing: 0.12em;
    color: rgba(177, 181, 189, 0.45);
  }
  .sym-value {
    font-size: 12px;
    font-weight: 700;
    color: var(--sc-text-0);
    letter-spacing: 0.02em;
  }
  .sym-caret {
    font-size: 9px;
    color: rgba(247, 242, 234, 0.5);
  }

  /* ── Price block ── */
  .price-block {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    flex-shrink: 0;
    font-family: var(--sc-font-mono);
  }
  .price-val {
    font-size: 13px;
    font-weight: 600;
    color: var(--sc-text-0);
    letter-spacing: 0.01em;
  }
  .price-chg {
    font-size: 11px;
    font-weight: 500;
  }
  .price-chg.up { color: var(--sc-good, #adca7c); }
  .price-chg.dn { color: var(--sc-bad, #cf7f8f); }

  /* ── Separators ── */
  .bar-sep {
    width: 1px;
    height: 16px;
    background: rgba(255,255,255,0.1);
    flex-shrink: 0;
  }
  .bar-spacer { flex: 1 1 auto; min-width: 4px; }

  /* ── TF row ── */
  .tf-row {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
  }
  .tf-btn {
    padding: 2px 6px;
    border-radius: 2px;
    border: none;
    background: transparent;
    color: rgba(247,242,234,0.38);
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: color 100ms ease, background 100ms ease;
  }
  .tf-btn:hover {
    color: rgba(247,242,234,0.72);
    background: rgba(255,255,255,0.05);
  }
  .tf-btn.active {
    color: var(--sc-text-0);
    background: rgba(255,255,255,0.08);
  }

  /* ── Markets toggle ── */
  .rail-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: var(--sc-radius-1, 2px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.028);
    cursor: pointer;
    font-family: var(--sc-font-mono);
    transition: background var(--sc-dur-fast, 140ms) ease, border-color var(--sc-dur-fast, 140ms) ease;
    flex-shrink: 0;
  }
  .rail-toggle:hover { background: rgba(255, 255, 255, 0.05); }
  .rail-toggle[aria-pressed='true'] {
    border-color: rgba(99, 179, 237, 0.28);
    background: rgba(99, 179, 237, 0.1);
  }
  .rail-kicker {
    font-size: 8px;
    letter-spacing: 0.12em;
    color: rgba(177, 181, 189, 0.45);
  }
  .rail-state {
    font-size: 10px;
    color: rgba(99, 179, 237, 0.72);
  }

  @media (max-width: 767px) {
    .command-bar { padding: 3px 8px; min-height: 32px; }
    .sym-chip { flex: 0 0 auto; }
    .price-block { display: none; }
  }
</style>
