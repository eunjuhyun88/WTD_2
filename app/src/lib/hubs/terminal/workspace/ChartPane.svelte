<script lang="ts">
  /**
   * ChartPane — Single pane in the multi-chart grid.
   *
   * Each pane owns its own symbol + timeframe state and renders a
   * full ChartBoard inside.  Clicking the pane marks it as active;
   * the active pane gets a blue border (TradingView style).
   *
   * Symbol change: user clicks the symbol badge in the pane header →
   * an inline input appears for a quick search.
   */
  import { onMount } from 'svelte';
  import ChartBoard from './ChartBoard.svelte';

  interface Props {
    /** Initial / controlled symbol */
    symbol: string;
    /** Initial / controlled timeframe */
    tf: string;
    /** Whether this pane is the active (focused) pane */
    active?: boolean;
    /** Whether the close button is visible (hidden when only 1 pane) */
    closeable?: boolean;
    /** Propagate symbol change upward */
    onSymbolChange?: (sym: string) => void;
    /** Propagate tf change upward */
    onTfChange?: (tf: string) => void;
    /** Activate this pane */
    onActivate?: () => void;
    /** Remove this pane from the grid */
    onClose?: () => void;
    /** contextMode forwarded to ChartBoard */
    contextMode?: 'full' | 'chart';
    /** surfaceStyle forwarded to ChartBoard */
    surfaceStyle?: 'default' | 'velo';
  }

  let {
    symbol: initialSymbol,
    tf: initialTf,
    active = false,
    closeable = true,
    onSymbolChange,
    onTfChange,
    onActivate,
    onClose,
    contextMode = 'chart',
    surfaceStyle = 'velo',
  }: Props = $props();

  // ── Per-pane state ──────────────────────────────────────────────────────────
  let symbol = $state(initialSymbol);
  let tf     = $state(initialTf);

  // Inline symbol editor
  let editing = $state(false);
  let editVal = $state(symbol);
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => { symbol = initialSymbol; });
  $effect(() => { tf     = initialTf; });

  function startEdit() {
    editVal = symbol;
    editing = true;
  }

  $effect(() => {
    if (editing && inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  });

  function commitEdit() {
    const trimmed = editVal.trim().toUpperCase();
    if (trimmed && trimmed !== symbol) {
      symbol = trimmed;
      onSymbolChange?.(trimmed);
    }
    editing = false;
  }

  function cancelEdit() {
    editing = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter')  commitEdit();
    if (e.key === 'Escape') cancelEdit();
  }

  function handlePaneClick() {
    if (!active) onActivate?.();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="chart-pane"
  class:active
  onclick={handlePaneClick}
>
  <!-- Pane header: symbol badge + tf badge + close button -->
  <div class="pane-header" role="toolbar" aria-label="Chart pane controls">
    {#if editing}
      <input
        bind:this={inputEl}
        bind:value={editVal}
        class="sym-input"
        type="text"
        placeholder="BTCUSDT"
        onblur={commitEdit}
        onkeydown={handleKeydown}
        aria-label="Edit symbol"
      />
    {:else}
      <button class="sym-badge" onclick={startEdit} aria-label="Change symbol: {symbol}">
        {symbol}
      </button>
    {/if}

    <span class="tf-badge">{tf}</span>

    {#if closeable}
      <button
        class="close-btn"
        onclick={(e) => { e.stopPropagation(); onClose?.(); }}
        aria-label="Close pane"
      >
        ✕
      </button>
    {/if}
  </div>

  <!-- Chart body -->
  <div class="pane-body">
    <ChartBoard
      {symbol}
      tf={tf}
      {contextMode}
      {surfaceStyle}
      onTfChange={(newTf) => { tf = newTf; onTfChange?.(newTf); }}
    />
  </div>
</div>

<style>
  .chart-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    position: relative;
    background: #0d1117;
    border: 1.5px solid transparent;
    border-radius: 4px;
    overflow: hidden;
    cursor: default;
    transition: border-color 0.15s;
  }

  .chart-pane.active {
    border-color: #2563eb;   /* TradingView blue */
  }

  /* ── Pane header ── */
  .pane-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    height: 28px;
    flex-shrink: 0;
    z-index: 5;
  }

  .sym-badge {
    font-size: 11px;
    font-weight: 700;
    color: #e2e8f0;
    letter-spacing: 0.04em;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    transition: background 0.1s;
    font-family: inherit;
  }

  .sym-badge:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .tf-badge {
    font-size: var(--ui-text-xs);
    color: rgba(255, 255, 255, 0.4);
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.05);
  }

  .sym-input {
    font-size: 11px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #e2e8f0;
    border-radius: 3px;
    padding: 2px 6px;
    width: 100px;
    outline: none;
    font-family: inherit;
    letter-spacing: 0.04em;
  }

  .close-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.2);
    cursor: pointer;
    font-size: var(--ui-text-xs);
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
    transition: color 0.1s, background 0.1s;
  }

  .close-btn:hover {
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.08);
  }

  /* ── Pane body fills remaining space ── */
  .pane-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
