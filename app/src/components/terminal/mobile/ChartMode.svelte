<script lang="ts">
  /**
   * ChartMode — STUB
   *
   * TODO: Full integration wired in merge step after W-0086 desktop agent lands.
   *
   * This component hosts:
   *   - ~70% vertical: CanvasHost (chart canvas from W-0086 layer)
   *   - ~30% vertical: indicator pane placeholder
   *
   * Once W-0086 lands, import CanvasHost from
   * `$lib/components/terminal/chart/CanvasHost.svelte` and conditionally
   * import `$lib/stores/chartSaveMode` for range-mode gesture handling.
   *
   * Gesture contract (W-0087):
   *   - During range-mode (chartSaveMode.active === true), a pointer layer
   *     intercepts single taps to set anchors. Long-press + drag >= 350ms
   *     required for pan. Pinch zoom always passes through.
   *   - Outside range-mode, native LWC interactions are unmodified.
   */

  // Dynamic import guard: CanvasHost may not exist until W-0086 merges.
  // Replace with a static import after merge.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let CanvasHost: any = $state(null);

  import { onMount } from 'svelte';

  onMount(async () => {
    try {
      // @ts-expect-error -- CanvasHost is created by W-0086; not yet on disk.
      const mod = await import('$lib/components/terminal/chart/CanvasHost.svelte');
      CanvasHost = mod.default;
    } catch {
      // CanvasHost not yet available — renders placeholder stub until W-0086 lands.
    }
  });
</script>

<div class="chart-mode">
  <div class="canvas-area">
    {#if CanvasHost}
      <!-- CanvasHost rendered here after W-0086 merge -->
      <!-- <svelte:component this={CanvasHost} /> -->
      <div class="chart-placeholder ready">
        <span class="placeholder-label">Chart (W-0086 연동 후 활성화)</span>
      </div>
    {:else}
      <div class="chart-placeholder">
        <span class="placeholder-label">차트</span>
        <span class="placeholder-sub">W-0086 머지 후 활성화됩니다</span>
      </div>
    {/if}
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

  .chart-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .chart-placeholder.ready {
    background: rgba(38, 166, 154, 0.04);
    border: 1px dashed rgba(38, 166, 154, 0.2);
    border-radius: 4px;
    margin: 12px;
    width: calc(100% - 24px);
    height: calc(100% - 24px);
  }

  .placeholder-label {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
    text-transform: uppercase;
  }

  .placeholder-sub {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: var(--sc-text-3, rgba(255,255,255,0.2));
    text-align: center;
    max-width: 200px;
    line-height: 1.4;
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
