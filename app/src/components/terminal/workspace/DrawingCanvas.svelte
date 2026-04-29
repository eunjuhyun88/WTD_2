<script lang="ts">
  /**
   * DrawingCanvas — Pure overlay canvas for DrawingManager rendering.
   * W-0289: Accepts an attached DrawingManager and just provides the canvas
   * element + resize handling. The manager handles all events and rendering.
   */
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { DrawingManager } from '$lib/chart/DrawingManager';

  interface Props {
    mgr: DrawingManager | null;
    containerEl: HTMLElement | undefined;
  }

  let { mgr, containerEl }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let resizeObs: ResizeObserver | null = null;

  // When canvas mounts, attach it to the manager
  $effect(() => {
    if (!browser || !canvasEl || !mgr) return;
    mgr.setCanvas(canvasEl);
    sizeCanvas();
    mgr.render();
  });

  // Resize observer
  $effect(() => {
    if (!containerEl || !canvasEl) return;

    resizeObs = new ResizeObserver(() => {
      sizeCanvas();
      mgr?.render();
    });
    resizeObs.observe(containerEl);

    return () => {
      resizeObs?.disconnect();
      resizeObs = null;
    };
  });

  function sizeCanvas() {
    if (!canvasEl || !containerEl) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = containerEl.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    canvasEl.width  = Math.round(width  * dpr);
    canvasEl.height = Math.round(height * dpr);
    canvasEl.style.width  = `${width}px`;
    canvasEl.style.height = `${height}px`;
  }

  onDestroy(() => {
    resizeObs?.disconnect();
  });
</script>

<canvas
  bind:this={canvasEl}
  class="drawing-canvas"
  aria-hidden="true"
></canvas>

<style>
  .drawing-canvas {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 4;
  }
</style>
