<script lang="ts">
  /**
   * Zone B (W-0048): L1 snapshot + L4 board context in one horizontal strip.
   * Parent owns chart payload + boardModel; no duplicate of chart header (24h / 1 bar / last).
   */
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { TerminalBoardModel } from '$lib/terminal/terminalBoardModel';
  import { buildCollectedMetricCells, type CollectedMetricCell } from '$lib/terminal/collectedMetrics';

  interface Props {
    chartPayload: ChartSeriesPayload | null;
    boardModel: TerminalBoardModel;
  }

  let { chartPayload, boardModel }: Props = $props();

  let cells = $derived(buildCollectedMetricCells(chartPayload, boardModel));

  function clamp01(value: number) {
    return Math.min(1, Math.max(0, value));
  }

  function rangePosition(cell: CollectedMetricCell) {
    if (!cell.range) return 0.5;
    const span = cell.range.max - cell.range.min;
    if (!Number.isFinite(span) || span <= 0) return 0.5;
    return clamp01((cell.range.value - cell.range.min) / span);
  }

  function midpointPosition(cell: CollectedMetricCell) {
    if (!cell.range || cell.range.midpoint == null) return null;
    const span = cell.range.max - cell.range.min;
    if (!Number.isFinite(span) || span <= 0) return null;
    return clamp01((cell.range.midpoint - cell.range.min) / span);
  }

  function sparkPoints(values: number[]) {
    if (values.length < 2) return '';
    const width = 92;
    const height = 20;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - ((value - min) / span) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
</script>

{#if cells.length > 0}
  <div class="metrics-dock" role="region" aria-label="Collected metrics for this symbol">
    <div class="metrics-dock-inner">
      {#each cells as cell (cell.id)}
        <div class="metric-cell" data-tone={cell.tone ?? 'neutral'}>
          <div class="metric-topline">
            <span class="metric-label">{cell.label}</span>
            {#if cell.pill}
              <span class="metric-pill">{cell.pill}</span>
            {/if}
          </div>
          <div class="metric-mainline">
            <span class="metric-value">{cell.value}</span>
            {#if cell.spark && cell.spark.length > 1}
              <svg class="metric-spark" viewBox="0 0 92 20" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={sparkPoints(cell.spark)} />
              </svg>
            {/if}
          </div>
          <div class="metric-footline">
            {#if cell.range}
              <div class="metric-range" aria-hidden="true">
                {#if midpointPosition(cell) !== null}
                  <span class="metric-range-mid" style={`left:${midpointPosition(cell)! * 100}%`}></span>
                {/if}
                <span class="metric-range-fill" style={`width:${rangePosition(cell) * 100}%`}></span>
                <span class="metric-range-dot" style={`left:${rangePosition(cell) * 100}%`}></span>
              </div>
            {/if}
            {#if cell.sub}
              <span class="metric-sub">{cell.sub}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .metrics-dock {
    flex-shrink: 0;
    border-top: 1px solid rgba(42, 46, 57, 0.95);
    background:
      linear-gradient(180deg, rgba(19, 23, 34, 0.98), rgba(19, 23, 34, 0.94));
  }
  .metrics-dock-inner {
    display: flex;
    flex-wrap: nowrap;
    gap: 0;
    overflow-x: auto;
    padding: 4px 6px 5px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
  }
  .metrics-dock-inner::-webkit-scrollbar {
    height: 4px;
  }
  .metrics-dock-inner::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }
  .metric-cell {
    flex: 0 0 auto;
    min-width: 124px;
    max-width: 208px;
    padding: 3px 9px 4px;
    border-right: 1px solid rgba(42, 46, 57, 0.85);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .metric-cell:last-child {
    border-right: none;
  }
  .metric-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .metric-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(177, 181, 189, 0.45);
  }
  .metric-pill {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 999px;
    color: rgba(209, 212, 220, 0.7);
    background: rgba(255, 255, 255, 0.05);
    white-space: nowrap;
  }
  .metric-mainline {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .metric-value {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 600;
    color: #d1d4dc;
    line-height: 1.25;
    word-break: break-word;
    flex-shrink: 0;
  }
  .metric-footline {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .metric-range {
    position: relative;
    height: 5px;
    width: 52px;
    flex-shrink: 0;
    border-radius: 999px;
    background:
      linear-gradient(90deg, rgba(241, 153, 153, 0.12), rgba(255, 255, 255, 0.06) 50%, rgba(143, 221, 157, 0.12));
    overflow: hidden;
  }
  .metric-range-mid {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(255, 255, 255, 0.22);
    transform: translateX(-50%);
  }
  .metric-range-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(90deg, rgba(99, 179, 237, 0.24), rgba(99, 179, 237, 0.5));
  }
  .metric-range-dot {
    position: absolute;
    top: 50%;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 0 2px rgba(19, 23, 34, 0.9);
  }
  .metric-spark {
    display: block;
    width: 54px;
    height: 16px;
    flex-shrink: 0;
  }
  .metric-spark polyline {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.86;
  }
  .metric-sub {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    line-height: 1.2;
    color: rgba(177, 181, 189, 0.42);
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .metric-cell[data-tone='bull'] .metric-value {
    color: #8fdd9d;
  }
  .metric-cell[data-tone='bull'] .metric-range-fill {
    background: linear-gradient(90deg, rgba(74, 222, 128, 0.16), rgba(74, 222, 128, 0.42));
  }
  .metric-cell[data-tone='bear'] .metric-value {
    color: #f19999;
  }
  .metric-cell[data-tone='bear'] .metric-range-fill {
    background: linear-gradient(90deg, rgba(248, 113, 113, 0.16), rgba(248, 113, 113, 0.42));
  }
  .metric-cell[data-tone='warn'] .metric-value {
    color: #e9c167;
  }
  .metric-cell[data-tone='warn'] .metric-range-fill {
    background: linear-gradient(90deg, rgba(251, 191, 36, 0.16), rgba(251, 191, 36, 0.42));
  }

  @media (max-width: 768px) {
    .metrics-dock-inner {
      padding-bottom: 6px;
    }
    .metric-cell {
      min-width: 116px;
    }
    .metric-mainline {
      gap: 6px;
    }
    .metric-spark {
      width: 44px;
    }
    .metric-range {
      width: 44px;
    }
  }
</style>
