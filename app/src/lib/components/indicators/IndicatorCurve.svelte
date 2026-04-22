<script lang="ts">
  /**
   * Archetype G — Term-Structure Curve
   *
   * x = tenor (1d / 7d / 30d / 90d / 180d), y = value.
   * Renders "today" as a solid line; optional "prev-week" as a dashed overlay.
   * Familiar from Laevitas / Deribit IV term-structure views.
   */
  import type { IndicatorDef, IndicatorValue, CurvePoint } from '$lib/indicators/types';

  interface Props { def: IndicatorDef; value: IndicatorValue; }
  let { def, value }: Props = $props();

  const W = 120, H = 36;

  const points = $derived.by((): CurvePoint[] => {
    const c = value.current;
    if (!Array.isArray(c) || !c.length) return [];
    // Type-narrow: CurvePoint has .tenor string
    if (typeof (c[0] as CurvePoint).tenor === 'string') return c as CurvePoint[];
    return [];
  });

  function buildPath(vals: number[]): string {
    if (vals.length < 2) return '';
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const pad = H * 0.08;
    return vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - pad - ((v - min) / range) * (H - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  const todayPath   = $derived(buildPath(points.map(p => p.value)));
  const prevPath    = $derived.by(() => {
    const prevVals = points.map(p => p.prevWeek).filter((v): v is number => v != null);
    return prevVals.length === points.length ? buildPath(prevVals) : '';
  });

  const lastVal = $derived(points.length ? points[points.length - 1].value : null);
  const formatted = $derived.by(() => {
    if (lastVal == null) return '—';
    const u = def.unit;
    if (u === '%') return `${lastVal >= 0 ? '+' : ''}${(lastVal * 100).toFixed(2)}%`;
    return `${lastVal >= 0 ? '+' : ''}${lastVal.toFixed(3)}`;
  });

  // Trend: last minus first
  const trend = $derived(points.length >= 2 ? points[points.length - 1].value - points[0].value : 0);
  const trendClass = $derived(trend > 0.0001 ? 'up' : trend < -0.0001 ? 'dn' : '');
</script>

<div class="curve" title={def.description ?? def.label ?? def.id}>
  <div class="label">{def.label ?? def.id}</div>
  <div class="value-row">
    <span class="value {trendClass}">{formatted}</span>
    {#if prevPath}<span class="vs-label">vs prev</span>{/if}
  </div>

  {#if points.length >= 2}
    <svg class="chart" viewBox="0 0 {W} {H}" aria-hidden="true">
      {#if prevPath}
        <path class="prev-line" d={prevPath} />
      {/if}
      <path class="today-line" d={todayPath} />
    </svg>

    <div class="tenors">
      {#each points as p}
        <span>{p.tenor}</span>
      {/each}
    </div>
  {:else}
    <div class="empty">—</div>
  {/if}
</div>

<style>
  .curve {
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
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--g6, rgba(255,255,255,0.5));
  }

  .value-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }
  .value.up { color: #4caf7d; }
  .value.dn { color: #e05c5c; }

  .vs-label {
    font-size: 8px;
    color: var(--g5, rgba(255,255,255,0.38));
    letter-spacing: 0.04em;
  }

  .chart {
    display: block;
    width: 100%;
    height: 36px;
    overflow: visible;
  }

  .today-line {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }

  .prev-line {
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    stroke-dasharray: 2 2;
    opacity: 0.45;
  }

  .tenors {
    display: flex;
    justify-content: space-between;
    font-size: 7px;
    color: var(--g4, rgba(255,255,255,0.28));
    letter-spacing: 0.02em;
    margin-top: 1px;
  }

  .empty {
    font-size: 12px;
    color: var(--g4, rgba(255,255,255,0.28));
    height: 36px;
    display: flex;
    align-items: center;
  }
</style>
