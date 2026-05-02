<script lang="ts">
  /**
   * Archetype I — Distribution Histogram
   *
   * Vertical bars by bucket (strike / price level / cohort) with a
   * marker line at current price or highlighted bucket.
   * Familiar from Coinglass OI-by-strike / liq cluster by level.
   */
  import type { IndicatorDef, IndicatorValue, HistogramBucket } from '$lib/indicators/types';

  interface Props { def: IndicatorDef; value: IndicatorValue; }
  let { def, value }: Props = $props();

  const W = 120, H = 36, BAR_GAP = 1;

  const buckets = $derived.by((): HistogramBucket[] => {
    const c = value.current;
    if (!Array.isArray(c) || !c.length) return [];
    if ('bucket' in (c[0] as HistogramBucket)) return c as HistogramBucket[];
    return [];
  });

  const maxVal = $derived(buckets.length ? Math.max(...buckets.map(b => b.value)) || 1 : 1);

  const barW = $derived(buckets.length > 0 ? Math.max(2, Math.floor((W - BAR_GAP * (buckets.length - 1)) / buckets.length)) : 0);

  // Highlighted bucket index (current price band)
  const highlightIdx = $derived(buckets.findIndex(b => b.highlight));

  // Total / peak label
  const total = $derived(buckets.reduce((a, b) => a + b.value, 0));
  function fmt(v: number): string {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return v.toFixed(0);
  }
  const totalFmt = $derived(fmt(total));
</script>

<div class="hist" title={def.description ?? def.label ?? def.id}>
  <div class="label">{def.label ?? def.id}</div>
  <div class="value-row">
    <span class="value">{totalFmt}</span>
    <span class="unit">{def.unit ?? ''}</span>
  </div>

  {#if buckets.length >= 2}
    <svg class="chart" viewBox="0 0 {W} {H}" aria-hidden="true">
      {#each buckets as b, i}
        {@const bh = Math.max(2, (b.value / maxVal) * (H - 2))}
        {@const bx = i * (barW + BAR_GAP)}
        {@const by = H - bh}
        <rect
          x={bx}
          y={by}
          width={barW}
          height={bh}
          class="bar {b.highlight ? 'highlight' : ''}"
        />
      {/each}

      {#if highlightIdx >= 0}
        {@const mx = highlightIdx * (barW + BAR_GAP) + barW / 2}
        <line class="marker" x1={mx} y1="0" x2={mx} y2={H} />
      {/if}
    </svg>

    <div class="bucket-labels">
      {#if buckets.length <= 6}
        {#each buckets as b}
          <span class:hl={b.highlight}>{b.bucket}</span>
        {/each}
      {:else}
        <span>{buckets[0].bucket}</span>
        <span class="center-label">·</span>
        <span>{buckets[buckets.length - 1].bucket}</span>
      {/if}
    </div>
  {:else}
    <div class="empty">—</div>
  {/if}
</div>

<style>
  .hist {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    font-family: var(--sc-font-mono, ui-monospace, monospace);
    font-size: 11px;
    line-height: 1.15;
    min-width: 120px;
    color: var(--g9, rgba(255,255,255,0.85));
  }

  .label {
    font-size: var(--ui-text-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--g6, rgba(255,255,255,0.5));
  }

  .value-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }

  .unit {
    font-size: var(--ui-text-xs);
    color: var(--g5, rgba(255,255,255,0.38));
  }

  .chart {
    display: block;
    width: 100%;
    height: 36px;
    overflow: visible;
  }

  .bar {
    fill: color-mix(in oklab, currentColor 40%, transparent);
    rx: 1px;
  }
  .bar.highlight {
    fill: var(--amb, #f0b847);
  }

  .marker {
    stroke: var(--amb, #f0b847);
    stroke-width: 1;
    stroke-dasharray: 2 1;
    opacity: 0.7;
  }

  .bucket-labels {
    display: flex;
    justify-content: space-between;
    font-size: 7px;
    color: var(--g4, rgba(255,255,255,0.28));
    letter-spacing: 0.02em;
    margin-top: 1px;
  }

  .bucket-labels span.hl {
    color: var(--amb, #f0b847);
  }

  .center-label {
    color: var(--g3, rgba(255,255,255,0.18));
  }

  .empty {
    font-size: 12px;
    color: var(--g4, rgba(255,255,255,0.28));
    height: 36px;
    display: flex;
    align-items: center;
  }
</style>
