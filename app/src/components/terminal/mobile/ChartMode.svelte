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
   * First-use onboarding:
   *   - MobileOnboardingOverlay is mounted on top; one-shot via localStorage.
   *   - A 3-second fade hint "드래그해서 구간을 지정하세요" shows when chart
   *     has data and save mode is not yet active.
   *
   * TODO: wire chartSaveMode gesture intercept layer when Save Setup is
   * exposed in the mobile Chart header row.
   */

  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import CanvasHost from '../chart/CanvasHost.svelte';
  import PhaseBadge from '../chart/overlay/PhaseBadge.svelte';
  import RangeModeToast from '../chart/overlay/RangeModeToast.svelte';
  import MobileOnboardingOverlay from './MobileOnboardingOverlay.svelte';
  import { activePairState } from '$lib/stores/activePairStore';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';

  // Derive symbol (e.g. 'BTC/USDT' → 'BTCUSDT') and tf from live store
  const symbol = $derived($activePairState.pair.replace('/', ''));
  const tf = $derived($activePairState.timeframe);

  // CanvasHost ref for imperative setCandles() call
  let canvasRef = $state<ReturnType<typeof CanvasHost> | null>(null);

  // Fetch klines whenever symbol or tf changes and push to canvas
  $effect(() => {
    const sym = symbol;
    const timeframe = tf;
    if (!browser || !sym) return;
    fetch(`/api/chart/klines?symbol=${encodeURIComponent(sym)}&tf=${encodeURIComponent(timeframe)}&limit=500`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (data?.klines?.length && canvasRef) {
          canvasRef.setCandles(data.klines);
        }
      })
      .catch(() => {/* silent — chart stays empty on network error */});
  });

  /**
   * First-use drag hint — visible for 3 seconds then fades.
   * Only shown when chart data is present and save mode not active.
   * Gated by the same localStorage key as the onboarding overlay; once
   * the overlay has been dismissed (key set), the hint has served its
   * purpose and we suppress it.
   */
  const STORAGE_KEY = 'cogochi.mobileOnboarded';
  const STORAGE_VERSION = 'v1';

  let showHint = $state(false);

  onMount(() => {
    if (!browser) return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen !== STORAGE_VERSION) {
      // Delay slightly so overlay shows first; hint fades in behind it
      // but becomes visible only after overlay is dismissed.
      const showTimer = setTimeout(() => {
        if (!$chartSaveMode.active) {
          showHint = true;
        }
      }, 600);
      const hideTimer = setTimeout(() => {
        showHint = false;
      }, 3600); // 600ms delay + 3000ms visible
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  });
</script>

<div class="chart-mode">
  <div class="canvas-area">
    <CanvasHost bind:this={canvasRef} {symbol} {tf} />
    <!-- Layer 2 overlay — pointer-events: none on container (W-0086) -->
    <div class="canvas-overlay">
      <div class="overlay-topright">
        {#if $chartSaveMode.active}
          <RangeModeToast active={$chartSaveMode.active} anchorASet={$chartSaveMode.anchorA !== null} />
        {/if}
        <PhaseBadge phase={null} />
      </div>

      <!-- First-use drag hint: visible for 3s then fades; never shown during range-mode -->
      {#if showHint && !$chartSaveMode.active}
        <div class="drag-hint" aria-hidden="true">드래그해서 구간을 지정하세요</div>
      {/if}
    </div>

    <!-- First-visit onboarding overlay — mounts above everything in the canvas area -->
    <MobileOnboardingOverlay />
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

  /* Full available vertical space */
  .canvas-area {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: var(--sc-terminal-bg, #0a0c10);
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

  /* First-use hint: bottom-center, semi-transparent, fades after mount via animation */
  .drag-hint {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(247, 242, 234, 0.52);
    white-space: nowrap;
    pointer-events: none;
    /* 3-second fade: appear briefly then dissolve */
    animation: hint-fade 3s cubic-bezier(0.4, 0, 1, 1) forwards;
  }

  @keyframes hint-fade {
    0%   { opacity: 0; }
    15%  { opacity: 1; }
    70%  { opacity: 1; }
    100% { opacity: 0; }
  }
</style>
