<script lang="ts">
  /**
   * Zone B (W-0048): L1 snapshot + L4 board context in one horizontal strip.
   * Parent owns chart payload + boardModel; no duplicate of chart header (24h / 1 bar / last).
   */
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { TerminalBoardModel } from '$lib/terminal/terminalBoardModel';
  import { buildCollectedMetricCells } from '$lib/terminal/collectedMetrics';

  interface Props {
    chartPayload: ChartSeriesPayload | null;
    boardModel: TerminalBoardModel;
  }

  let { chartPayload, boardModel }: Props = $props();

  let cells = $derived(buildCollectedMetricCells(chartPayload, boardModel));
</script>

{#if cells.length > 0}
  <div class="metrics-dock" role="region" aria-label="Collected metrics for this symbol">
    <div class="metrics-dock-inner">
      {#each cells as cell (cell.id)}
        <div class="metric-cell" data-tone={cell.tone ?? 'neutral'}>
          <span class="metric-label">{cell.label}</span>
          <span class="metric-value">{cell.value}</span>
          {#if cell.sub}
            <span class="metric-sub">{cell.sub}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .metrics-dock {
    flex-shrink: 0;
    border-top: 1px solid rgba(42, 46, 57, 0.95);
    background: rgba(19, 23, 34, 0.98);
  }
  .metrics-dock-inner {
    display: flex;
    flex-wrap: nowrap;
    gap: 0;
    overflow-x: auto;
    padding: 6px 8px 8px;
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
    min-width: 108px;
    max-width: 200px;
    padding: 4px 10px;
    border-right: 1px solid rgba(42, 46, 57, 0.85);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .metric-cell:last-child {
    border-right: none;
  }
  .metric-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(177, 181, 189, 0.45);
  }
  .metric-value {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    color: #d1d4dc;
    line-height: 1.25;
    word-break: break-word;
  }
  .metric-sub {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    line-height: 1.2;
    color: rgba(177, 181, 189, 0.42);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .metric-cell[data-tone='bull'] .metric-value {
    color: #8fdd9d;
  }
  .metric-cell[data-tone='bear'] .metric-value {
    color: #f19999;
  }
  .metric-cell[data-tone='warn'] .metric-value {
    color: #e9c167;
  }
</style>
