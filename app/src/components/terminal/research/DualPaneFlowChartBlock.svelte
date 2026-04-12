<script lang="ts">
  import type { CandlePoint, DualPaneFlowChartBlock, FlowSeries, TimePoint } from '$lib/contracts';

  let {
    block,
    presentation = 'inline',
  }: {
    block: DualPaneFlowChartBlock;
    presentation?: 'inline' | 'focus';
  } = $props();

  function isCandlePoint(point: CandlePoint | TimePoint): point is CandlePoint {
    return 'o' in point && 'h' in point && 'l' in point && 'c' in point;
  }

  function linePath(points: TimePoint[], width: number, height: number): string {
    if (points.length < 2) return '';
    const values = points.map((point) => point.v ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return points.map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - (((point.v ?? 0) - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }

  function areaPath(points: TimePoint[], width: number, height: number): string {
    const line = linePath(points, width, height);
    if (!line) return '';
    return `${line} L ${width},${height} L 0,${height} Z`;
  }

  function histogramBars(points: TimePoint[], width: number, height: number): Array<{ x: number; y: number; w: number; h: number; positive: boolean }> {
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

  function latestValue(series: FlowSeries): number | null {
    return series.points.length > 0 ? series.points[series.points.length - 1].v ?? null : null;
  }

  function formatValue(series: FlowSeries): string {
    const value = latestValue(series);
    if (value == null) return '--';
    if (series.id.includes('funding')) return `${value.toFixed(2)} bps`;
    if (series.id.includes('oi')) {
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    }
    if (series.id.includes('ratio')) return value.toFixed(2);
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(2);
  }

  function topLinePoints(): TimePoint[] {
    return (block.topPane.price as Array<CandlePoint | TimePoint>).map((point) =>
      isCandlePoint(point) ? { t: point.t, v: point.c } : point
    );
  }

  const topPoints = $derived(topLinePoints());

  function compareLabel(deltaPct: number | null): string {
    if (deltaPct == null) return '--';
    return `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(2)}%`;
  }
</script>

<div class:focus={presentation === 'focus'} class="dual-pane-flow">
  <div class="dpf-top">
    <div class="dpf-head">
      <span class="dpf-title">Price</span>
      <div class="dpf-chips">
        {#each block.compareWindows as window}
          <span class:up={(window.deltaPct ?? 0) > 0} class:down={(window.deltaPct ?? 0) < 0} class="dpf-chip">
            {window.key} {compareLabel(window.deltaPct)}
          </span>
        {/each}
      </div>
    </div>
    <svg class="dpf-top-chart" viewBox="0 0 640 110" preserveAspectRatio="none">
      <path d={areaPath(topPoints, 640, 90)} fill="rgba(219, 154, 159, 0.08)"></path>
      <path d={linePath(topPoints, 640, 90)} fill="none" stroke="#f7f2ea" stroke-width="2"></path>
    </svg>
  </div>

  <div class="dpf-bottom">
    {#each block.bottomPane.series as series}
      <div class="flow-track">
        <div class="flow-meta">
          <span class="flow-label">{series.label}</span>
          <span class="flow-value">{formatValue(series)}</span>
        </div>
        <svg class="flow-svg" viewBox="0 0 640 64" preserveAspectRatio="none">
          {#if series.mode === 'histogram'}
            <line x1="0" y1="32" x2="640" y2="32" stroke="rgba(247, 242, 234, 0.08)" stroke-width="1"></line>
            {#each histogramBars(series.points, 640, 64) as bar}
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                fill={bar.positive ? 'rgba(173, 202, 124, 0.55)' : 'rgba(207, 127, 143, 0.55)'}
              ></rect>
            {/each}
          {:else if series.mode === 'area'}
            <path d={areaPath(series.points, 640, 56)} fill="rgba(0, 229, 255, 0.12)"></path>
            <path d={linePath(series.points, 640, 56)} fill="none" stroke="#00e5ff" stroke-width="2"></path>
          {:else}
            <path d={linePath(series.points, 640, 56)} fill="none" stroke={series.id.includes('oi') ? '#f2d193' : '#cf7f8f'} stroke-width="2"></path>
          {/if}
        </svg>
      </div>
    {/each}
  </div>
</div>

<style>
  .dual-pane-flow {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dpf-top,
  .dpf-bottom {
    border: 1px solid rgba(219, 154, 159, 0.16);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(11, 18, 32, 0.92), rgba(5, 9, 20, 0.96));
    padding: 10px 12px;
  }
  .dpf-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .dpf-title,
  .flow-label {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    letter-spacing: 1px;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
    text-transform: uppercase;
    font-weight: 700;
  }
  .dpf-top-chart {
    width: 100%;
    height: 110px;
  }
  .dpf-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }
  .dpf-chip {
    border-radius: 999px;
    border: 1px solid rgba(219, 154, 159, 0.16);
    padding: 3px 6px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
  }
  .dpf-chip.up {
    color: var(--sc-good, #adca7c);
    border-color: rgba(173, 202, 124, 0.3);
  }
  .dpf-chip.down {
    color: var(--sc-bad, #cf7f8f);
    border-color: rgba(207, 127, 143, 0.3);
  }
  .dpf-bottom {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .flow-track {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .flow-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .flow-value {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    color: var(--sc-text-1, rgba(247, 242, 234, 0.84));
    font-weight: 700;
  }
  .flow-svg {
    width: 100%;
    height: 64px;
    overflow: visible;
  }
</style>
