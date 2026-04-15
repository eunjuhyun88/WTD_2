<script lang="ts">
  import type { SurfaceMetricItem } from '$lib/terminal/terminalSurfaceModel';

  interface Props {
    items?: SurfaceMetricItem[];
  }

  let { items = [] }: Props = $props();
</script>

{#if items.length > 0}
  <div class="chart-metric-strip">
    {#each items as item}
      <div class="metric-tile" data-tone={item.tone}>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
      </div>
    {/each}
  </div>
{/if}

<style>
  .chart-metric-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    padding: 1px 0;
    background: rgba(255,255,255,0.05);
  }

  .metric-tile {
    min-width: 0;
    display: grid;
    gap: 2px;
    padding: 5px 8px;
    background: rgba(7,10,16,0.95);
    border-top: 1px solid rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }

  .metric-tile span,
  .metric-tile strong {
    font-family: var(--sc-font-mono);
  }

  .metric-tile span {
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(247,242,234,0.38);
  }

  .metric-tile strong {
    font-size: 10px;
    color: rgba(247,242,234,0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .metric-tile[data-tone='bull'] strong { color: #8fdd9d; }
  .metric-tile[data-tone='bear'] strong { color: #f19999; }
  .metric-tile[data-tone='warn'] strong { color: #e9c167; }
  .metric-tile[data-tone='info'] strong { color: #83bcff; }

  @media (max-width: 960px) {
    .chart-metric-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
