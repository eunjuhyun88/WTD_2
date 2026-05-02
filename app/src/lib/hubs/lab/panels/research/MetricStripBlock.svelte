<script lang="ts">
  import type { MetricCompare, MetricStripBlock } from '$lib/contracts';

  let {
    block,
    presentation = 'inline',
  }: {
    block: MetricStripBlock;
    presentation?: 'inline' | 'focus';
  } = $props();

  function formatNumber(value: number | null | undefined, metric: MetricCompare): string {
    if (value == null || Number.isNaN(value)) return '--';
    switch (metric.unit) {
      case 'usd':
        return '$' + value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 0 : 2 });
      case 'pct':
        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
      case 'ratio':
        return value.toFixed(2);
      case 'usd_compact':
        if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
        if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
        return '$' + value.toFixed(0);
      case 'count':
        return value.toLocaleString();
      default:
        if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
        if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
        if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
        return value.toFixed(2);
    }
  }

  function deltaClass(deltaPct: number | null | undefined): string {
    if (deltaPct == null) return 'flat';
    if (deltaPct > 0) return 'up';
    if (deltaPct < 0) return 'down';
    return 'flat';
  }
</script>

<div class:focus={presentation === 'focus'} class="metric-strip">
  {#each block.metrics as metric}
    <article class="metric-card">
      <div class="metric-head">
        <span class="metric-label">{metric.label}</span>
        {#if metric.percentile != null}
          <span class="metric-tag">p{Math.round(metric.percentile)}</span>
        {/if}
      </div>
      <div class="metric-current">{formatNumber(metric.current, metric)}</div>
      <div class="metric-compare-row">
        {#each metric.compare as window}
          <div class="cmp-chip {deltaClass(window.deltaPct)}">
            <span class="cmp-key">{window.key}</span>
            <span class="cmp-value">
              {#if window.deltaAbs == null}
                --
              {:else}
                {formatNumber(window.deltaAbs, metric)}
              {/if}
            </span>
          </div>
        {/each}
      </div>
      {#if metric.interpretation}
        <div class="metric-note">{metric.interpretation}</div>
      {/if}
    </article>
  {/each}
</div>

<style>
  .metric-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
  }
  .metric-strip.focus {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
  .metric-card {
    border: 1px solid rgba(219, 154, 159, 0.16);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(11, 18, 32, 0.92), rgba(5, 9, 20, 0.96));
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .metric-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .metric-label {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 1px;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
    text-transform: uppercase;
  }
  .metric-tag {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: var(--ui-text-xs);
    color: var(--sc-warn, #f2d193);
  }
  .metric-current {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 20px;
    line-height: 1.05;
    font-weight: 800;
    color: var(--sc-text-0, #f7f2ea);
  }
  .metric-compare-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cmp-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 7px;
    border-radius: 999px;
    border: 1px solid rgba(219, 154, 159, 0.16);
    background: rgba(247, 242, 234, 0.02);
    min-width: fit-content;
  }
  .cmp-chip.up {
    border-color: rgba(173, 202, 124, 0.3);
    color: var(--sc-good, #adca7c);
    background: rgba(173, 202, 124, 0.08);
  }
  .cmp-chip.down {
    border-color: rgba(207, 127, 143, 0.3);
    color: var(--sc-bad, #cf7f8f);
    background: rgba(207, 127, 143, 0.08);
  }
  .cmp-chip.flat {
    color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
  }
  .cmp-key,
  .cmp-value {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
  }
  .metric-note {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 11px;
    color: var(--sc-text-2, rgba(247, 242, 234, 0.7));
  }
</style>
