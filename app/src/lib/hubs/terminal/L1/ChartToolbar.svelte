<script lang="ts">
  /**
   * ChartToolbar — 36px horizontal bar between TabBar and chart canvas.
   * Phase D-2: chart-type dropdown, +Indicator, Replay, Snap, Settings, Save.
   *
   * Replay / Snap dispatch cogochi:cmd events that later phases (D-5, D-6) wire
   * to real handlers; today they're effectively no-ops at the AppShell level.
   */
  import { onMount } from 'svelte';
  import { shellStore, activeTabState } from '../shell.store';
  import type { ChartType } from '../shell.store';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import { chartSaveModeV2 } from '$lib/stores/chartSaveMode.store';

  interface Props {
    onIndicators?: () => void;
    onSettings?: () => void;
  }
  const { onIndicators, onSettings }: Props = $props();

  const CHART_TYPES: Array<{ id: ChartType; label: string; full: string }> = [
    { id: 'candle', label: 'CNDL', full: 'Candle' },
    { id: 'line',   label: 'LINE', full: 'Line' },
    { id: 'heikin', label: 'HA',   full: 'Heikin Ashi' },
    { id: 'bar',    label: 'BAR',  full: 'Bar' },
    { id: 'area',   label: 'AREA', full: 'Area' },
  ];

  const chartType = $derived($activeTabState.chartType ?? 'candle');
  const currentLabel = $derived(
    CHART_TYPES.find((t) => t.id === chartType)?.full ?? 'Candle',
  );

  let typeOpen = $state(false);
  let typeMenu: HTMLDivElement | null = $state(null);

  function pickType(id: ChartType) {
    shellStore.setChartType(id);
    typeOpen = false;
  }

  function dispatch(id: string) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('cogochi:cmd', { detail: { id } }));
  }

  function startSave() {
    chartSaveMode.enterRangeMode();
    chartSaveModeV2.enterRangeMode();
    shellStore.updateTabState((s) => ({ ...s, rangeSelection: true }));
  }

  function onIndicator() {
    if (onIndicators) onIndicators();
    else dispatch('open_indicator_settings');
  }

  // Close dropdown on outside click / Escape
  onMount(() => {
    function onClick(e: MouseEvent) {
      if (!typeOpen) return;
      const target = e.target as Node | null;
      if (typeMenu && target && !typeMenu.contains(target)) typeOpen = false;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && typeOpen) typeOpen = false;
    }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="chart-toolbar" role="toolbar" aria-label="Chart toolbar">
  <!-- Chart type dropdown -->
  <div class="ct-wrap" bind:this={typeMenu}>
    <button
      class="tb-btn tb-trigger"
      class:open={typeOpen}
      onclick={() => (typeOpen = !typeOpen)}
      title="Chart type"
      aria-haspopup="listbox"
      aria-expanded={typeOpen}
    >
      <span class="tb-label">{currentLabel}</span>
      <span class="tb-arrow">▾</span>
    </button>
    {#if typeOpen}
      <div class="ct-menu" role="listbox" aria-label="Chart type">
        {#each CHART_TYPES as ct (ct.id)}
          <button
            type="button"
            class="ct-item"
            class:active={chartType === ct.id}
            role="option"
            aria-selected={chartType === ct.id}
            onclick={() => pickType(ct.id)}
          >
            <span class="ct-item-label">{ct.label}</span>
            <span class="ct-item-full">{ct.full}</span>
            {#if chartType === ct.id}<span class="ct-item-check">✓</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <span class="tb-divider"></span>

  <button class="tb-btn" onclick={onIndicator} title="Add indicator">
    <span class="tb-glyph">+</span><span class="tb-text">Indicator</span>
  </button>

  <button class="tb-btn" onclick={() => dispatch('toggle_replay')} title="Replay (D-5)">
    <span class="tb-glyph">▶</span><span class="tb-text">Replay</span>
  </button>

  <button class="tb-btn" onclick={() => dispatch('chart_snapshot')} title="Snapshot (D-6)">
    <span class="tb-text">Snap</span>
  </button>

  <span class="tb-spacer"></span>

  <button class="tb-btn" onclick={onSettings ?? onIndicator} title="Chart settings">
    <span class="tb-text">Set</span>
  </button>

  <button class="tb-btn tb-primary" onclick={startSave} title="Save range (B)">
    <span class="tb-text">Save</span>
  </button>
</div>

<style>
  .chart-toolbar {
    height: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    background: var(--g1);
    border-bottom: 1px solid var(--g3);
    font-family: 'JetBrains Mono', monospace;
    color: var(--g8);
    overflow: hidden;
  }

  .tb-divider {
    width: 1px;
    height: 16px;
    background: var(--g3);
    margin: 0 4px;
    flex-shrink: 0;
  }

  .tb-spacer {
    flex: 1;
  }

  .tb-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    background: transparent;
    border: 0.5px solid transparent;
    border-radius: 3px;
    color: var(--g7);
    font-family: inherit;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
    flex-shrink: 0;
  }
  .tb-btn:hover {
    background: var(--g2);
    color: var(--g9);
    border-color: var(--g4);
  }

  .tb-glyph {
    font-size: 11px;
    line-height: 1;
  }

  .tb-text {
    font-size: var(--ui-text-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .tb-trigger.open,
  .tb-trigger:focus-visible {
    background: var(--g2);
    color: var(--g9);
    border-color: var(--g5);
    outline: none;
  }
  .tb-label {
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--g9);
  }
  .tb-arrow {
    font-size: var(--ui-text-xs);
    color: var(--g6);
  }

  .tb-primary {
    color: var(--brand);
    border-color: color-mix(in srgb, var(--brand) 35%, transparent);
  }
  .tb-primary:hover {
    background: color-mix(in srgb, var(--brand) 12%, transparent);
    color: var(--brand);
    border-color: color-mix(in srgb, var(--brand) 60%, transparent);
  }

  .ct-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .ct-menu {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 100;
    min-width: 140px;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 4px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
    padding: 2px;
    display: flex;
    flex-direction: column;
  }

  .ct-item {
    display: grid;
    grid-template-columns: 36px 1fr 12px;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--g7);
    font-family: inherit;
    font-size: var(--ui-text-xs);
    text-align: left;
    cursor: pointer;
    transition: background 0.08s, color 0.08s;
  }
  .ct-item:hover {
    background: var(--g2);
    color: var(--g9);
  }
  .ct-item.active {
    color: var(--brand);
  }
  .ct-item-label {
    font-weight: 700;
    letter-spacing: 0.06em;
    font-size: var(--ui-text-xs);
  }
  .ct-item-full {
    font-size: var(--ui-text-xs);
  }
  .ct-item-check {
    color: var(--brand);
    font-size: var(--ui-text-xs);
  }

  /* Compact viewport: hide button text labels, keep glyph */
  @media (max-width: 1099px) {
    .tb-text { display: none; }
  }
</style>
