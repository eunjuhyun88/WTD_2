<script lang="ts">
  /**
   * MobileSymbolStrip — slim 48px top strip showing active symbol.
   * Tapping opens the SymbolPicker overlay.
   * Reuses SymbolPicker from workspace if available.
   */
  import SymbolPicker from '../workspace/SymbolPicker.svelte';
  import { activePair, setActivePair } from '$lib/stores/activePairStore';

  interface Props {
    onSelect?: (pair: string) => void;
  }

  let { onSelect }: Props = $props();

  let pickerOpen = $state(false);

  function handleSelect(pair: string) {
    setActivePair(pair);
    onSelect?.(pair);
    pickerOpen = false;
  }

  function handleClose() {
    pickerOpen = false;
  }
</script>

<div class="symbol-strip">
  <button
    class="symbol-btn"
    onclick={() => (pickerOpen = true)}
    aria-label="심볼 변경"
  >
    <span class="symbol-name">{$activePair || 'BTC/USDT'}</span>
    <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>
</div>

{#if pickerOpen}
  <div class="picker-overlay" role="dialog" aria-modal="true" aria-label="심볼 선택">
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
    padding: 0 16px;
    background: var(--sc-terminal-bg, #0a0c10);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .symbol-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px 0;
    /* 44pt touch target */
    min-height: 44px;
  }

  .symbol-name {
    font-family: var(--sc-font-mono);
    font-size: 16px;
    font-weight: 800;
    color: var(--sc-text-0, rgba(247,242,234,0.98));
    letter-spacing: -0.01em;
  }

  .chevron {
    width: 16px;
    height: 16px;
    color: var(--sc-text-3, rgba(255,255,255,0.35));
  }

  .picker-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: var(--sc-terminal-bg, #0a0c10);
    overflow: hidden;
  }
</style>
