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
  const latestPrice = $derived(linePoints.length > 0 ? linePoints[linePoints.length - 1]?.v ?? null : null);
  const priceBounds = $derived(buildPriceBounds(linePoints, block.cells ?? []));
  const priceRail = $derived(buildPriceRail(priceBounds));
  const timeRail = $derived(buildTimeRail(linePoints));
  const stageStats = $derived(buildStageStats({
    latestPrice,
    bounds: priceBounds,
    cells: block.cells ?? [],
    markers: block.markers ?? [],
    tracks: block.lowerPane?.series?.length ?? 0,
  }));

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

  function formatPrice(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '--';
    if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (Math.abs(value) >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  function formatTimeLabel(timestamp: number | null | undefined): string {
    if (timestamp == null || !Number.isFinite(timestamp)) return '--';
    const date = new Date(timestamp * 1000);
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function buildPriceBounds(points: TimePoint[], cells: HeatmapCell[]) {
    if (points.length === 0) return { min: null, max: null };
    const values = points.map((point) => point.v ?? 0);
    const cellValues = cells.flatMap((cell) => [cell.y0, cell.y1]);
    const merged = [...values, ...cellValues].filter((value) => Number.isFinite(value));
    if (merged.length === 0) return { min: null, max: null };
    return {
      min: Math.min(...merged),
      max: Math.max(...merged),
    };
  }

  function buildPriceRail(bounds: { min: number | null; max: number | null }) {
    if (bounds.min == null || bounds.max == null) return [];
    const levels = [0, 0.25, 0.5, 0.75, 1];
    return levels.map((ratio) => ({
      key: `${ratio}`,
      value: bounds.max! - (bounds.max! - bounds.min!) * ratio,
      topPct: ratio * 100,
    }));
  }

  function buildTimeRail(points: TimePoint[]) {
    if (points.length < 2) return [];
    const midIndex = Math.floor((points.length - 1) / 2);
    const picks = [0, midIndex, points.length - 1];
    return picks.map((index, railIndex) => ({
      key: `${railIndex}-${points[index]?.t ?? railIndex}`,
      label: formatTimeLabel(points[index]?.t ?? null),
      align: railIndex === 0 ? 'start' : railIndex === picks.length - 1 ? 'end' : 'center',
    }));
  }

  function buildStageStats(input: {
    latestPrice: number | null;
    bounds: { min: number | null; max: number | null };
    cells: HeatmapCell[];
    markers: any[];
    tracks: number;
  }) {
    const rangePct =
      input.bounds.min != null &&
      input.bounds.max != null &&
      input.bounds.min > 0
        ? ((input.bounds.max - input.bounds.min) / input.bounds.min) * 100
        : null;
    return [
      { label: 'LAST', value: formatPrice(input.latestPrice), tone: 'neutral' },
      { label: 'RANGE', value: rangePct != null ? `${rangePct.toFixed(2)}%` : '--', tone: 'cyan' },
      { label: 'WALLS', value: `${input.cells.length}`, tone: 'bull' },
      { label: 'EVENTS', value: `${input.markers.length}`, tone: 'warn' },
      { label: 'TRACKS', value: `${input.tracks}`, tone: 'neutral' },
    ];
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

  <div class="hfc-stage-meta">
    {#each stageStats as stat}
      <span class={`hfc-stage-chip tone-${stat.tone}`}>
        <em>{stat.label}</em>
        <strong>{stat.value}</strong>
      </span>
    {/each}
  </div>

  <div class="hfc-top">
    <canvas bind:this={heatmapCanvas} class="hfc-canvas" style:height={`${topHeight}px`}></canvas>
    {#if priceRail.length > 0}
      <div class="hfc-price-rail">
        {#each priceRail as level}
          <span class="hfc-price-label" style:top={`${level.topPct}%`}>
            {formatPrice(level.value)}
          </span>
        {/each}
      </div>
    {/if}
  </div>

  {#if timeRail.length > 0}
    <div class="hfc-time-rail">
      {#each timeRail as tick}
        <span class={`hfc-time-label align-${tick.align}`}>{tick.label}</span>
      {/each}
    </div>
  {/if}

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
    border: 1px solid rgba(39, 63, 86, 0.82);
    border-radius: 10px;
    padding: 10px;
    background:
      radial-gradient(circle at top left, rgba(54, 215, 255, 0.05), transparent 28%),
      linear-gradient(180deg, rgba(7, 14, 26, 0.96), rgba(3, 8, 16, 0.99));
    box-shadow: inset 0 1px 0 rgba(119, 160, 194, 0.05);
  }
  .hfc-top,
  .hfc-bottom {
    border: 1px solid rgba(39, 63, 86, 0.82);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(11, 18, 32, 0.96), rgba(5, 9, 20, 0.99));
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
    border: 1px solid rgba(39, 63, 86, 0.78);
    padding: 4px 8px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    background: rgba(8, 19, 32, 0.88);
    color: rgba(158, 188, 214, 0.7);
  }
  .hfc-legend-item i {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    display: inline-block;
  }
  .hfc-stage-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .hfc-stage-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    padding: 5px 8px;
    border-radius: 4px;
    border: 1px solid rgba(39, 63, 86, 0.78);
    background: rgba(7, 16, 28, 0.88);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
  }
  .hfc-stage-chip em {
    font-style: normal;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(122, 156, 185, 0.72);
  }
  .hfc-stage-chip strong {
    font-size: 11px;
    font-weight: 700;
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
  .hfc-top {
    position: relative;
    overflow: hidden;
  }
  .hfc-price-rail {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 72px;
    border-left: 1px solid rgba(39, 63, 86, 0.72);
    background: linear-gradient(180deg, rgba(6, 14, 23, 0.9), rgba(3, 8, 15, 0.92));
    pointer-events: none;
  }
  .hfc-price-label {
    position: absolute;
    right: 8px;
    transform: translateY(-50%);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    color: rgba(180, 206, 228, 0.74);
  }
  .hfc-time-rail {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 0 2px;
  }
  .hfc-time-label {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    color: rgba(122, 156, 185, 0.72);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .align-start {
    text-align: left;
  }
  .align-center {
    text-align: center;
  }
  .align-end {
    text-align: right;
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
  .tone-bull strong {
    color: var(--sc-good, #adca7c);
  }
  .tone-bear strong {
    color: var(--sc-bad, #cf7f8f);
  }
  .tone-cyan strong {
    color: #36d7ff;
  }
  .tone-warn strong {
    color: #f2d193;
  }
  .tone-neutral strong {
    color: rgba(231, 241, 248, 0.9);
  }
</style>
