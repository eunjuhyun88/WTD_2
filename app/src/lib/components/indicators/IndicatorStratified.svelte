<script lang="ts">
  /**
   * Archetype B — Actor-Stratified Multi-Line
   *
   * Shows the same metric split by actor cohort (order-size bucket for CVD,
   * COT commercial vs spec, smart-money wallet tier). Each line is normalized
   * to 0-1 within its own history window so direction comparisons are valid
   * even when cohorts have very different scales.
   *
   * Divergence detection (whale vs retail) surfaces as an amber banner.
   */
  import type { IndicatorDef, IndicatorValue, ActorSeriesRow } from '$lib/indicators/types';

  interface Props {
    def: IndicatorDef;
    value: IndicatorValue;
    height?: number;
  }
  let { def, value, height = 120 }: Props = $props();

  const rows = $derived<ActorSeriesRow[]>(
    Array.isArray(value.current) && value.current.length && 'series' in (value.current[0] ?? {})
      ? (value.current as ActorSeriesRow[])
      : []
  );

  /** Fixed colour per actor so whale is consistently amber across charts. */
  function actorColor(actor: string): string {
    const key = actor.toLowerCase();
    if (key.includes('whale') || key.includes('1m')) return 'var(--amb, #f0b847)';
    if (key.includes('commercial')) return 'var(--cyan, #4fb8d8)';
    if (key.includes('spec')) return 'var(--neg, #d66c7a)';
    if (key.includes('retail') || key.includes('$100') || key.includes('small')) return 'var(--blue, #6c8cd4)';
    return 'var(--pos, #4fb872)';
  }

  /** Per-row min/max normalization so the full chart shows 0..1 band. */
  const normalized = $derived(
    rows.map(r => {
      if (!r.series?.length) return { ...r, normalizedSeries: [] as number[] };
      const min = Math.min(...r.series);
      const max = Math.max(...r.series);
      const range = max - min || 1;
      return { ...r, normalizedSeries: r.series.map(v => (v - min) / range) };
    })
  );

  /** Correlation between first and last cohort (proxy: whale vs retail). */
  const divergence = $derived.by(() => {
    if (normalized.length < 2) return null;
    const a = normalized[0].normalizedSeries;
    const b = normalized[normalized.length - 1].normalizedSeries;
    const n = Math.min(a.length, b.length);
    if (n < 8) return null;
    const aM = a.slice(0, n).reduce((s, x) => s + x, 0) / n;
    const bM = b.slice(0, n).reduce((s, x) => s + x, 0) / n;
    let num = 0, aSq = 0, bSq = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - aM, db = b[i] - bM;
      num += da * db;
      aSq += da * da;
      bSq += db * db;
    }
    const denom = Math.sqrt(aSq * bSq);
    if (denom === 0) return null;
    const corr = num / denom;
    if (corr < -0.4) return { type: 'diverging', strength: -corr, bars: n };
    return null;
  });

  function seriesPath(series: number[], w = 100, h = 100): string {
    if (series.length < 2) return '';
    return series
      .map((v, i) => {
        const x = (i / (series.length - 1)) * w;
        const y = h - v * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }
</script>

<div class="strat" title={def.description ?? def.label ?? def.id} style="height: {height}px">
  <div class="strat-head">
    <span class="label">{def.label ?? def.id}</span>
    <span class="legend">
      {#each normalized as row (row.actor)}
        <span class="legend-item">
          <span class="dot" style="background: {actorColor(row.actor)}"></span>
          <span class="lk">{row.label ?? row.actor}</span>
        </span>
      {/each}
    </span>
  </div>

  {#if rows.length === 0}
    <div class="empty">no cohort data</div>
  {:else}
    <svg class="chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {#each normalized as row (row.actor)}
        <path d={seriesPath(row.normalizedSeries)} stroke={actorColor(row.actor)} stroke-width="1.5" fill="none" />
      {/each}
    </svg>
  {/if}

  {#if divergence}
    <div class="div-badge">
      ⚠ COHORT DIVERGENCE · {divergence.bars} bars · strength {divergence.strength.toFixed(2)}
    </div>
  {/if}
</div>

<style>
  .strat {
    display: flex;
    flex-direction: column;
    padding: 6px 10px;
    background: color-mix(in oklab, currentColor 3%, transparent);
    border-radius: 3px;
    font-family: var(--sc-font-mono, monospace);
    color: var(--g9, rgba(255, 255, 255, 0.85));
  }

  .strat-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }

  .label {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--g6, rgba(255, 255, 255, 0.5));
  }

  .legend {
    display: inline-flex;
    gap: 10px;
    font-size: 9px;
    color: var(--g6);
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
  }

  .chart {
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
  }

  .empty {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--g5, rgba(255, 255, 255, 0.38));
  }

  .div-badge {
    font-size: 10px;
    padding: 3px 6px;
    margin-top: 4px;
    background: color-mix(in oklab, var(--amb, #f0b847) 18%, transparent);
    color: var(--amb, #f0b847);
    letter-spacing: 0.02em;
    border-radius: 2px;
    text-align: center;
    animation: ind-pulse 2.4s ease-in-out infinite;
  }

  @keyframes ind-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.6; }
  }
</style>
