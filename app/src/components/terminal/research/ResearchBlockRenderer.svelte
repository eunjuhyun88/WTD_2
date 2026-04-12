<script lang="ts">
  import type { ResearchBlockEnvelope } from '$lib/contracts';
  import MetricStripBlock from './MetricStripBlock.svelte';
  import InlinePriceChartBlock from './InlinePriceChartBlock.svelte';
  import DualPaneFlowChartBlock from './DualPaneFlowChartBlock.svelte';
  import HeatmapFlowChartBlock from './HeatmapFlowChartBlock.svelte';

  let {
    envelope,
    presentation = 'inline',
    interactive = false,
    onSelect,
  }: {
    envelope: ResearchBlockEnvelope;
    presentation?: 'inline' | 'focus';
    interactive?: boolean;
    onSelect?: (envelope: ResearchBlockEnvelope) => void;
  } = $props();

  function handleSelect() {
    if (!interactive) return;
    onSelect?.(envelope);
  }
</script>

{#if interactive}
  <div
    class:clickable={interactive}
    class:focus={presentation === 'focus'}
    class="research-block-shell"
  >
    <div class="rbs-header">
      {#if envelope.title}
        <span class="rbs-title">{envelope.title}</span>
      {/if}
      <span class="rbs-meta">{envelope.symbol.replace('USDT', '')} · {envelope.timeframe.toUpperCase()}</span>
    </div>

    {#if envelope.block.kind === 'metric_strip'}
      <MetricStripBlock block={envelope.block} presentation={presentation} />
    {:else if envelope.block.kind === 'inline_price_chart'}
      <InlinePriceChartBlock block={envelope.block} presentation={presentation} />
    {:else if envelope.block.kind === 'dual_pane_flow_chart'}
      <DualPaneFlowChartBlock block={envelope.block} presentation={presentation} />
    {:else if envelope.block.kind === 'heatmap_flow_chart'}
      <HeatmapFlowChartBlock block={envelope.block} presentation={presentation} />
    {/if}

    {#if envelope.summary}
      <div class="rbs-summary">{envelope.summary}</div>
    {/if}

    <div class="rbs-actions">
      <button type="button" class="rbs-detail-btn" onclick={handleSelect}>
        More detail
      </button>
    </div>
  </div>
{:else}
  <div
    class:clickable={interactive}
    class:focus={presentation === 'focus'}
    class="research-block-shell"
  >
    <div class="rbs-header">
      {#if envelope.title}
        <span class="rbs-title">{envelope.title}</span>
      {/if}
      <span class="rbs-meta">{envelope.symbol.replace('USDT', '')} · {envelope.timeframe.toUpperCase()}</span>
    </div>

    {#if envelope.block.kind === 'metric_strip'}
      <MetricStripBlock block={envelope.block} presentation={presentation} />
    {:else if envelope.block.kind === 'inline_price_chart'}
      <InlinePriceChartBlock block={envelope.block} presentation={presentation} />
    {:else if envelope.block.kind === 'dual_pane_flow_chart'}
      <DualPaneFlowChartBlock block={envelope.block} presentation={presentation} />
    {:else if envelope.block.kind === 'heatmap_flow_chart'}
      <HeatmapFlowChartBlock block={envelope.block} presentation={presentation} />
    {/if}

    {#if envelope.summary}
      <div class="rbs-summary">{envelope.summary}</div>
    {/if}
  </div>
{/if}

<style>
  .research-block-shell {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    color: inherit;
  }
  .research-block-shell.clickable {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .rbs-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .rbs-title {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 18px;
    letter-spacing: 0.5px;
    color: var(--sc-text-0, #f7f2ea);
  }
  .rbs-meta,
  .rbs-summary {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 11px;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
  }
  .rbs-summary {
    line-height: 1.5;
  }
  .rbs-actions {
    display: flex;
    justify-content: flex-start;
  }
  .rbs-detail-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(219, 154, 159, 0.9);
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition:
      color 120ms ease;
  }
  .rbs-detail-btn::after {
    content: '→';
    margin-left: 6px;
    font-size: 11px;
  }
  .rbs-detail-btn:hover {
    color: var(--sc-text-0, #f7f2ea);
  }
</style>
