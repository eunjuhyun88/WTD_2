<script lang="ts">
  /**
   * MobileSymbolStrip — 48px top strip: symbol + price + change% + TF chips.
   * Tapping the symbol opens SymbolPicker overlay.
   */
  import { SymbolPicker } from '$lib/hubs/terminal';
  import { activePair, activePairState, setActivePair, setActiveTimeframe } from '$lib/stores/activePairStore';
  import { priceChanges } from '$lib/stores/priceStore';

  interface Props {
    onSelect?: (pair: string) => void;
  }

  let { onSelect }: Props = $props();

  let pickerOpen = $state(false);

  const TF_OPTIONS = ['1h', '4h', '1d'] as const;

  function handleSelect(pair: string) {
    setActivePair(pair);
    onSelect?.(pair);
    pickerOpen = false;
  }

  function handleClose() {
    pickerOpen = false;
  }

  // Derive base asset from pair (e.g. "BTC/USDT" → "BTC")
  const base = $derived($activePairState.pair.split('/')[0] ?? 'BTC');
  const price = $derived($activePairState.prices[base as keyof typeof $activePairState.prices] ?? 0);
  const change = $derived($priceChanges[base + 'USDT'] ?? 0);
  const tf = $derived($activePairState.timeframe);

  function formatPrice(p: number): string {
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return p.toFixed(4);
  }
</script>

<div class="symbol-strip">
  <!-- Left: symbol button -->
  <button
    class="symbol-btn"
    onclick={() => (pickerOpen = true)}
    aria-label="Change symbol"
  >
    <span class="symbol-name">{$activePair || 'BTC/USDT'}</span>
    <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>

  <!-- Center: price + change% -->
  <div class="price-info">
    {#if price > 0}
      <span class="price">{formatPrice(price)}</span>
      <span class="change" class:pos={change >= 0} class:neg={change < 0}>
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </span>
    {/if}
  </div>

  <!-- Right: TF chips -->
  <div class="tf-chips" role="group" aria-label="Timeframe">
    {#each TF_OPTIONS as t}
      <button
        class="tf-chip"
        class:active={tf === t}
        onclick={() => setActiveTimeframe(t)}
        aria-pressed={tf === t}
      >{t.toUpperCase()}</button>
    {/each}
  </div>
</div>

{#if pickerOpen}
  <div class="picker-overlay" role="dialog" aria-modal="true" aria-label="Select symbol">
    <SymbolPicker
      activePair={$activePair}
      onSelect={handleSelect}
      onClose={handleClose}
    />
  </div>
{/if}

<style>
  .symbol-strip {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    background: var(--sc-terminal-bg, #0a0c10);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .symbol-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
    min-height: 44px;
    flex-shrink: 0;
  }

  .symbol-name {
    font-family: var(--sc-font-mono);
    font-size: 14px;
    font-weight: 800;
    color: var(--sc-text-0, rgba(247,242,234,0.98));
    letter-spacing: -0.01em;
  }

  .chevron {
    width: 14px;
    height: 14px;
    color: var(--sc-text-3, rgba(255,255,255,0.35));
  }

  .price-info {
    display: flex;
    align-items: baseline;
    gap: 5px;
    flex: 1;
    min-width: 0;
  }

  .price {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--sc-text-0, rgba(247,242,234,0.92));
    letter-spacing: -0.01em;
  }

  .change {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 600;
  }

  .change.pos { color: #26a69a; }
  .change.neg { color: #ef5350; }

  .tf-chips {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }

  .tf-chip {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--sc-text-3, rgba(255,255,255,0.4));
    background: none;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px;
    padding: 3px 6px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }

  .tf-chip.active {
    color: var(--sc-accent, #e2c882);
    border-color: var(--sc-accent, #e2c882);
    background: rgba(226,200,130,0.08);
  }

  .picker-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: var(--sc-terminal-bg, #0a0c10);
    overflow: hidden;
  }
</style>
