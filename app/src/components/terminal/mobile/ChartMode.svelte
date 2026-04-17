<script lang="ts">
  /**
   * ChartMode — mobile Chart tab
   *
   * Hosts:
   *   - ~70% vertical: CanvasHost (chart canvas, W-0086 Layer 0)
   *   - ~30% vertical: indicator pane placeholder
   *
   * Gesture contract (W-0087):
   *   - During range-mode (chartSaveMode.active === true), a pointer layer
   *     intercepts single taps to set anchors. Long-press + drag >= 350ms
   *     required for pan. Pinch zoom always passes through.
   *   - Outside range-mode, native LWC interactions are unmodified.
   *
   * TODO: wire chartSaveMode gesture intercept layer when Save Setup is
   * exposed in the mobile Chart header row.
   */

  import CanvasHost from '../chart/CanvasHost.svelte';
  import PhaseBadge from '../chart/overlay/PhaseBadge.svelte';
  import RangeModeToast from '../chart/overlay/RangeModeToast.svelte';
  import { activePairState } from '$lib/stores/activePairStore';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';

  // Derive symbol (e.g. 'BTC/USDT' → 'BTCUSDT') and tf from live store
  const symbol = $derived($activePairState.pair.replace('/', ''));
  const tf = $derived($activePairState.timeframe);
</script>

<div class="chart-mode">
  <div class="canvas-area">
    <CanvasHost {symbol} {tf} />
    <!-- Layer 2 overlay — pointer-events: none on container (W-0086) -->
    <div class="canvas-overlay">
      <div class="overlay-topright">
        {#if $chartSaveMode.active}
          <RangeModeToast active={$chartSaveMode.active} anchorASet={$chartSaveMode.anchorA !== null} />
        {/if}
        <PhaseBadge phase={null} />
      </div>
    </div>
  </div>

  <div class="indicator-area">
    <div class="indicator-placeholder">
      <span class="indicator-label">INDICATOR PANE</span>
    </div>
  </div>
</div>

<style>
  .chart-mode {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ~70% of available vertical space */
  .canvas-area {
    flex: 7;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: var(--sc-terminal-bg, #0a0c10);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  /* Layer 2 overlay — pointer-events: none so LWC crosshair/pan/zoom are unblocked (W-0086) */
  .canvas-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
  }

  .overlay-topright {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    pointer-events: none;
  }

  /* ~30% of available vertical space */
  .indicator-area {
    flex: 3;
    min-height: 0;
    overflow: hidden;
    background: var(--sc-terminal-bg, #0a0c10);
  }

  .indicator-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .indicator-label {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--sc-text-3, rgba(255,255,255,0.2));
    text-transform: uppercase;
  }
</style>
