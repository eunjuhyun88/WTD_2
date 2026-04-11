<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type {
    CandlePoint,
    FlowSeries,
    HeatmapCell,
    HeatmapFlowChartBlock,
    TimePoint,
  } from '$lib/contracts';

  let {
    block,
    presentation = 'inline',
  }: {
    block: HeatmapFlowChartBlock;
    presentation?: 'inline' | 'focus';
  } = $props();

  let heatmapCanvas: HTMLCanvasElement | undefined = $state();
  let resizeObserver: ResizeObserver | null = null;

  function isCandlePoint(point: CandlePoint | TimePoint): point is CandlePoint {
    return 'o' in point && 'h' in point && 'l' in point && 'c' in point;
  }

  function pricePoints(): TimePoint[] {
    return block.price.map((point) => (isCandlePoint(point) ? { t: point.t, v: point.c } : point));
  }

  const linePoints = $derived(pricePoints());
  const topHeight = $derived(presentation === 'focus' ? 320 : 220);
  const lowerHeight = $derived(presentation === 'focus' ? 120 : 84);

  function linePath(points: TimePoint[], width: number, height: number): string {
    if (points.length < 2) return '';
    const values = points.map((point) => point.v ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * width;
        const y = height - (((point.v ?? 0) - min) / range) * height;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }

  function histogramBars(
    points: TimePoint[],
    width: number,
    height: number
  ): Array<{ x: number; y: number; w: number; h: number; positive: boolean }> {
    if (points.length === 0) return [];
    const values = points.map((point) => point.v ?? 0);
    const maxAbs = Math.max(...values.map((value) => Math.abs(value))) || 1;
    const barWidth = Math.max(width / Math.max(points.length, 1) - 1, 1);
    return points.map((point, index) => {
      const raw = point.v ?? 0;
      const normalized = Math.abs(raw) / maxAbs;
      const h = normalized * (height / 2);
      const x = (index / Math.max(points.length, 1)) * width;
      const y = raw >= 0 ? height / 2 - h : height / 2;
      return { x, y, w: barWidth, h, positive: raw >= 0 };
    });
  }

  function formatCompact(value: number | null | undefined): string {
    if (value == null) return '--';
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(2);
  }

  function latestValue(series: FlowSeries): number | null {
    return series.points.length > 0 ? series.points[series.points.length - 1]?.v ?? null : null;
  }

  function formatSeriesValue(series: FlowSeries): string {
    const value = latestValue(series);
    if (value == null) return '--';
    if (series.id.includes('ratio')) return value.toFixed(2);
    return formatCompact(value);
  }

  function cellColor(cell: HeatmapCell): string {
    switch (cell.side) {
      case 'bid':
        return `rgba(173, 202, 124, ${0.12 + cell.intensity * 0.66})`;
      case 'ask':
        return `rgba(207, 127, 143, ${0.12 + cell.intensity * 0.66})`;
      case 'buy_liq':
        return `rgba(255, 220, 110, ${0.14 + cell.intensity * 0.76})`;
      case 'sell_liq':
        return `rgba(86, 146, 255, ${0.12 + cell.intensity * 0.74})`;
      default:
        return `rgba(247, 242, 234, ${0.08 + cell.intensity * 0.3})`;
    }
  }

  function compareLabel(deltaPct: number | null): string {
    if (deltaPct == null) return '--';
    return `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(2)}%`;
  }

  function drawHeatmap() {
    if (!heatmapCanvas) return;
    const ctx = heatmapCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = heatmapCanvas.clientWidth;
    const cssHeight = topHeight;
    heatmapCanvas.width = Math.floor(cssWidth * dpr);
    heatmapCanvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const points = linePoints;
    if (points.length < 2) return;

    const cells = block.cells ?? [];
    const times = points.map((point) => point.t);
    const values = points.map((point) => point.v ?? 0);
    const yValues = cells.flatMap((cell) => [cell.y0, cell.y1, ...values]);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minPrice = Math.min(...yValues);
    const maxPrice = Math.max(...yValues);
    const timeRange = maxTime - minTime || 1;
    const priceRange = maxPrice - minPrice || 1;

    const toX = (time: number) => ((time - minTime) / timeRange) * cssWidth;
    const toY = (price: number) => cssHeight - ((price - minPrice) / priceRange) * cssHeight;

    ctx.fillStyle = 'rgba(5, 9, 20, 0.96)';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.strokeStyle = 'rgba(247, 242, 234, 0.05)';
    ctx.lineWidth = 1;
    for (let row = 1; row < 4; row += 1) {
      const y = (cssHeight / 4) * row;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
    }

    for (const cell of cells) {
      const x = toX(cell.x0);
      const width = Math.max(2, toX(cell.x1) - x);
      const y = toY(cell.y1);
      const height = Math.max(2, toY(cell.y0) - y);
      ctx.fillStyle = cellColor(cell);
      ctx.fillRect(x, y, width, height);
    }

    ctx.strokeStyle = 'rgba(247, 242, 234, 0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = toX(point.t);
      const y = toY(point.v ?? 0);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  onMount(() => {
    if (!heatmapCanvas) return;
    resizeObserver = new ResizeObserver(() => drawHeatmap());
    resizeObserver.observe(heatmapCanvas);
    drawHeatmap();
  });

  onDestroy(() => {
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
  });

  $effect(() => {
    block;
    presentation;
    if (heatmapCanvas) {
      drawHeatmap();
    }
  });
</script>

<div class:focus={presentation === 'focus'} class="heatmap-flow-chart">
  <div class="hfc-head">
    <div class="hfc-legend">
      {#each block.legend as item}
        <span class="hfc-legend-item">
          <i style:background={item.color}></i>
          {item.label}
        </span>
      {/each}
    </div>

    <div class="hfc-chips">
      {#each block.compareWindows as window}
        <span class:up={(window.deltaPct ?? 0) > 0} class:down={(window.deltaPct ?? 0) < 0} class="hfc-chip">
          {window.key} {compareLabel(window.deltaPct)}
        </span>
      {/each}
    </div>
  </div>

  <div class="hfc-top">
    <canvas bind:this={heatmapCanvas} class="hfc-canvas" style:height={`${topHeight}px`}></canvas>
  </div>

  {#if block.markers.length > 0}
    <div class="hfc-events">
      {#each block.markers as marker}
        <span class:bull={marker.direction === 'bull'} class:bear={marker.direction === 'bear'} class="hfc-event">
          {marker.label}
        </span>
      {/each}
    </div>
  {/if}

  {#if block.lowerPane?.series && block.lowerPane.series.length > 0}
    <div class="hfc-bottom">
      {#each block.lowerPane.series as series}
        <div class="hfc-track">
          <div class="hfc-track-meta">
            <span class="hfc-track-label">{series.label}</span>
            <span class="hfc-track-value">{formatSeriesValue(series)}</span>
          </div>
          <svg class="hfc-track-svg" viewBox={`0 0 640 ${lowerHeight}`} preserveAspectRatio="none">
            {#if series.mode === 'histogram'}
              <line x1="0" y1={lowerHeight / 2} x2="640" y2={lowerHeight / 2} stroke="rgba(247, 242, 234, 0.08)" stroke-width="1"></line>
              {#each histogramBars(series.points, 640, lowerHeight) as bar}
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.w}
                  height={bar.h}
                  fill={bar.positive ? 'rgba(255, 220, 110, 0.56)' : 'rgba(86, 146, 255, 0.52)'}
                ></rect>
              {/each}
            {:else}
              <path
                d={linePath(series.points, 640, lowerHeight - 8)}
                fill="none"
                stroke={series.id.includes('cvd') ? '#00e5ff' : series.id.includes('ratio') ? '#f2d193' : '#cf7f8f'}
                stroke-width="2"
              ></path>
            {/if}
          </svg>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .heatmap-flow-chart {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .hfc-top,
  .hfc-bottom {
    border: 1px solid rgba(219, 154, 159, 0.16);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(11, 18, 32, 0.92), rgba(5, 9, 20, 0.98));
    overflow: hidden;
  }
  .hfc-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .hfc-legend,
  .hfc-chips,
  .hfc-events {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .hfc-legend-item,
  .hfc-chip,
  .hfc-event {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    border: 1px solid rgba(219, 154, 159, 0.16);
    padding: 4px 8px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    background: rgba(247, 242, 234, 0.03);
    color: var(--sc-text-3, rgba(247, 242, 234, 0.58));
  }
  .hfc-legend-item i {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    display: inline-block;
  }
  .hfc-chip.up,
  .hfc-event.bull {
    color: var(--sc-good, #adca7c);
    border-color: rgba(173, 202, 124, 0.28);
  }
  .hfc-chip.down,
  .hfc-event.bear {
    color: var(--sc-bad, #cf7f8f);
    border-color: rgba(207, 127, 143, 0.28);
  }
  .hfc-canvas {
    width: 100%;
    display: block;
  }
  .hfc-bottom {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
  }
  .hfc-track {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hfc-track-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .hfc-track-label {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
    font-weight: 700;
  }
  .hfc-track-value {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    color: var(--sc-text-1, rgba(247, 242, 234, 0.84));
    font-weight: 700;
  }
  .hfc-track-svg {
    width: 100%;
    overflow: visible;
  }
</style>
