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

  // TODO: pass real symbol/tf from activePairStore when mobile Save Setup
  // header row is implemented.
</script>

<div class="chart-mode">
  <div class="canvas-area">
    <!-- TODO: bind:this for imperative API if needed; pass symbol/tf from store -->
    <CanvasHost symbol="BTCUSDT" tf="1h" />
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
