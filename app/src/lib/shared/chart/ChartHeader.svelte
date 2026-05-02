<script lang="ts">
  /**
   * ChartHeader.svelte — Layer 3 chart-owned header
   *
   * Owns: timeframe switching, indicators menu slot, Save Setup button.
   * Per W-0078: chart header must not own symbol summary beyond minimal market identity.
   * Per W-0086: Save Setup button calls chartSaveMode.enterRangeMode().
   */
  import { chartSaveMode } from '$lib/stores/chartSaveMode';

  const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d', '1w'];

  interface Props {
    tf: string;
    onTfChange?: (tf: string) => void;
    /** Number of active indicators for badge */
    activeIndicatorCount?: number;
    /** Called when indicators button is clicked */
    onIndicatorsClick?: () => void;
    /** Optional: show in range-mode style when active */
    rangeModeActive?: boolean;
  }

  let {
    tf,
    onTfChange,
    activeIndicatorCount = 0,
    onIndicatorsClick,
    rangeModeActive = false,
  }: Props = $props();

  const saveActive = $derived($chartSaveMode.active);

  function handleSaveSetup() {
    if (saveActive) {
      chartSaveMode.exitRangeMode();
    } else {
      chartSaveMode.enterRangeMode();
    }
  }
</script>

<div class="chart-header" class:range-active={rangeModeActive || saveActive}>
  <!-- Timeframe strip -->
  <div class="tf-strip">
    {#each TIMEFRAMES as t}
      <button
        class="tf-btn"
        class:active={tf === t}
        type="button"
        onclick={() => onTfChange?.(t)}
      >
        {t.toUpperCase()}
      </button>
    {/each}
  </div>

  <!-- Spacer -->
  <div class="header-spacer"></div>

  <!-- Indicators button (slot-like) -->
  <button
    class="header-btn indicators-btn"
    type="button"
    onclick={onIndicatorsClick}
    aria-label="Indicators"
  >
    <span class="btn-label">Indicators</span>
    {#if activeIndicatorCount > 0}
      <span class="indicator-badge">{activeIndicatorCount}</span>
    {/if}
  </button>

  <!-- Save Setup CTA -->
  <button
    class="header-btn save-btn"
    class:active={saveActive}
    type="button"
    onclick={handleSaveSetup}
    aria-label={saveActive ? 'Cancel range selection' : 'Save Setup — click to select range'}
  >
    {#if saveActive}
      <span class="save-icon">✕</span>
      <span class="btn-label">Cancel</span>
    {:else}
      <span class="save-icon">⊞</span>
      <span class="btn-label">Save Setup</span>
    {/if}
  </button>
</div>

<style>
  .chart-header {
    display: flex;
    align-items: center;
    gap: 0;
    height: 30px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(10, 13, 18, 0.98);
    padding: 0 4px 0 0;
    transition: border-bottom-color 0.15s;
  }

  .chart-header.range-active {
    border-bottom-color: rgba(77, 143, 245, 0.45);
  }

  /* Timeframe strip */
  .tf-strip {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
  }

  .tf-btn {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(247, 242, 234, 0.45);
    background: none;
    border: none;
    padding: 0 8px;
    height: 30px;
    cursor: pointer;
    transition: color 0.1s;
    white-space: nowrap;
  }

  .tf-btn:hover {
    color: rgba(247, 242, 234, 0.80);
  }

  .tf-btn.active {
    color: rgba(247, 242, 234, 0.95);
    font-weight: 800;
  }

  .header-spacer {
    flex: 1;
  }

  /* Shared button chrome */
  .header-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 9px;
    height: 22px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.025);
    cursor: pointer;
    margin-left: 4px;
    transition: all 0.1s;
  }

  .header-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.14);
  }

  .btn-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 600;
    color: rgba(247, 242, 234, 0.55);
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  /* Indicators */
  .indicator-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(131, 188, 255, 0.9);
    background: rgba(131, 188, 255, 0.12);
    border-radius: 2px;
    padding: 0 3px;
    min-width: 14px;
    text-align: center;
  }

  /* Save Setup */
  .save-btn .save-icon {
    font-size: var(--ui-text-xs);
    color: rgba(131, 188, 255, 0.7);
  }

  .save-btn .btn-label {
    color: rgba(131, 188, 255, 0.75);
  }

  .save-btn:hover .btn-label,
  .save-btn:hover .save-icon {
    color: rgba(131, 188, 255, 1);
  }

  .save-btn.active {
    background: rgba(77, 143, 245, 0.12);
    border-color: rgba(77, 143, 245, 0.40);
  }

  .save-btn.active .btn-label,
  .save-btn.active .save-icon {
    color: rgba(131, 188, 255, 0.90);
  }
</style>
