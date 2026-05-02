<script lang="ts">
  /**
   * AIOverlayCanvas — Phase D-5 overlay canvas for AI shapes
   * (range / arrow / annotation). Renders above the DrawingCanvas.
   *
   * Price-line shapes are rendered via lightweight-charts createPriceLine()
   * elsewhere (PriceLineManager); this canvas is for the non-line shapes.
   */
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';
  import { chartAIOverlay, type AIOverlayShape } from '$lib/stores/chartAIOverlay';

  interface Props {
    chart: IChartApi | null;
    series: ISeriesApi<SeriesType> | null;
    containerEl: HTMLElement | undefined;
    symbol: string;
  }

  let { chart, series, containerEl, symbol }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let resizeObs: ResizeObserver | null = null;
  let unsubRange: (() => void) | null = null;
  let pendingFrame: number | null = null;

  const visibleShapes = $derived(
    $chartAIOverlay.symbol === symbol
      ? $chartAIOverlay.shapes.filter((s) => s.kind && s.kind !== 'line')
      : [],
  );

  $effect(() => {
    if (!browser || !canvasEl) return;
    sizeCanvas();
    scheduleRender();
  });

  $effect(() => {
    if (!chart) return;
    const handle = () => scheduleRender();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handle);
    unsubRange = () => chart?.timeScale().unsubscribeVisibleLogicalRangeChange(handle);
    return () => {
      unsubRange?.();
      unsubRange = null;
    };
  });

  $effect(() => {
    if (!containerEl || !canvasEl) return;
    resizeObs = new ResizeObserver(() => {
      sizeCanvas();
      scheduleRender();
    });
    resizeObs.observe(containerEl);
    return () => {
      resizeObs?.disconnect();
      resizeObs = null;
    };
  });

  // Re-render when shapes change.
  $effect(() => {
    void visibleShapes;
    scheduleRender();
  });

  function sizeCanvas() {
    if (!canvasEl || !containerEl) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = containerEl.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    canvasEl.width = Math.round(width * dpr);
    canvasEl.height = Math.round(height * dpr);
    canvasEl.style.width = `${width}px`;
    canvasEl.style.height = `${height}px`;
  }

  function scheduleRender() {
    if (pendingFrame !== null) return;
    if (typeof requestAnimationFrame === 'undefined') {
      render();
      return;
    }
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null;
      render();
    });
  }

  function project(time: number, price: number): { x: number; y: number } | null {
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(time as Time);
    const y = series.priceToCoordinate(price);
    if (x == null || y == null) return null;
    const dpr = window.devicePixelRatio || 1;
    return { x: x * dpr, y: y * dpr };
  }

  function render() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    for (const shape of visibleShapes) drawShape(ctx, shape);
  }

  function drawShape(ctx: CanvasRenderingContext2D, shape: AIOverlayShape) {
    if (shape.kind === 'range') {
      const a = project(shape.fromTime, shape.fromPrice);
      const b = project(shape.toTime,   shape.toPrice);
      if (!a || !b) return;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      ctx.fillStyle = withAlpha(shape.color, 0.18);
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      if (shape.label) drawLabel(ctx, x + 4, y + 12, shape.label, shape.color);
    } else if (shape.kind === 'arrow') {
      const a = project(shape.fromTime, shape.fromPrice);
      const b = project(shape.toTime,   shape.toPrice);
      if (!a || !b) return;
      ctx.strokeStyle = shape.color;
      ctx.fillStyle   = shape.color;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      drawArrowHead(ctx, a.x, a.y, b.x, b.y);
      if (shape.label) drawLabel(ctx, b.x + 6, b.y, shape.label, shape.color);
    } else if (shape.kind === 'annotation') {
      const p = project(shape.time, shape.price);
      if (!p) return;
      ctx.fillStyle = shape.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      drawLabel(ctx, p.x + 6, p.y, shape.text, shape.color);
    }
  }

  function drawLabel(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    text: string, color: string,
  ) {
    const dpr = window.devicePixelRatio || 1;
    ctx.font = `${11 * dpr}px 'JetBrains Mono', monospace`;
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(text);
    const padX = 4 * dpr;
    const padY = 3 * dpr;
    const w = metrics.width + padX * 2;
    const h = 14 * dpr;
    ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
    ctx.fillRect(x, y - h / 2, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x + padX, y);
  }

  function drawArrowHead(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
  ) {
    const dpr = window.devicePixelRatio || 1;
    const head = 6 * dpr;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function withAlpha(c: string, alpha: number): string {
    if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
      const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
      return c + a;
    }
    if (c.startsWith('rgba')) return c;
    if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    return c;
  }

  onDestroy(() => {
    if (pendingFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(pendingFrame);
    }
    resizeObs?.disconnect();
    unsubRange?.();
  });
</script>

<canvas bind:this={canvasEl} class="ai-overlay-canvas" aria-hidden="true"></canvas>

<style>
  .ai-overlay-canvas {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 5;
  }
</style>
