<script lang="ts">
  /**
   * Archetype C — Price × Time Heatmap (intensity on 2D grid)
   *
   * Renders a grid of (time_bucket × price_bucket) cells where color intensity
   * reflects magnitude (USD for liq, volume for depth). This is the Material
   * Indicators / Coinglass visualization — clusters become *magnets* on a map.
   *
   * Phase 1: SVG renderer. Good for ≤ 500 cells. Phase 2 will swap to Canvas
   * for large datasets and lightweight-charts custom series integration.
   *
   * Used for Liquidations (Pillar 1), Orderbook depth, Volume profile.
   */
  import type { IndicatorDef, IndicatorValue, HeatmapCell } from '$lib/indicators/types';

  interface Props {
    def: IndicatorDef;
    value: IndicatorValue;
    /** Height in pixels of the pane (width is 100%). */
    height?: number;
  }
  let { def, value, height = 140 }: Props = $props();

  const cells = $derived<HeatmapCell[]>(
    Array.isArray(value.current) && value.current.length && 'priceBucket' in (value.current[0] ?? {})
      ? (value.current as HeatmapCell[])
      : []
  );

  const bounds = $derived.by(() => {
    if (cells.length === 0) return null;
    const times = cells.map(c => c.timeBucket);
    const prices = cells.map(c => c.priceBucket);
    const intensities = cells.map(c => c.intensity).filter(v => Number.isFinite(v) && v > 0);
    return {
      tMin: Math.min(...times),
      tMax: Math.max(...times),
      pMin: Math.min(...prices),
      pMax: Math.max(...prices),
      iMin: intensities.length ? Math.min(...intensities) : 0,
      iMax: intensities.length ? Math.max(...intensities) : 1,
    };
  });

  /** Log-scale color for long-tail intensity (liquidations cluster heavy). */
  function intensityAlpha(i: number): number {
    if (!bounds || bounds.iMax <= 0) return 0;
    const logMax = Math.log1p(bounds.iMax);
    const logCur = Math.log1p(Math.max(0, i));
    return Math.max(0.05, Math.min(1, logCur / logMax));
  }

  function sideColor(side?: HeatmapCell['side']): string {
    if (side === 'long')  return 'var(--pos, #4fb872)';  // long liq = red candle move down
    if (side === 'short') return 'var(--neg, #d66c7a)';  // short liq = green candle move up
    if (side === 'bid')   return 'var(--pos, #4fb872)';
    if (side === 'ask')   return 'var(--neg, #d66c7a)';
    return 'var(--amb, #f0b847)';
  }

  /** Cell geometry projected into SVG viewBox 0..100 × 0..100. */
  function cellRect(cell: HeatmapCell) {
    if (!bounds) return { x: 0, y: 0, w: 0, h: 0 };
    const tRange = bounds.tMax - bounds.tMin || 1;
    const pRange = bounds.pMax - bounds.pMin || 1;
    // Heuristic cell sizes: 40 time buckets × 30 price buckets.
    const cw = 100 / 40;
    const ch = 100 / 30;
    const x = ((cell.timeBucket - bounds.tMin) / tRange) * (100 - cw);
    const y = 100 - (((cell.priceBucket - bounds.pMin) / pRange) * (100 - ch) + ch); // invert y (price up)
    return { x, y, w: cw, h: ch };
  }
</script>

<div class="heatmap" style="height: {height}px" title={def.description ?? def.label ?? def.id}>
  <div class="hm-head">
    <span class="hm-label">{def.label ?? def.id}</span>
    {#if bounds}
      <span class="hm-legend">
        <span class="leg-dot dot-long" aria-hidden="true"></span> long
        <span class="leg-dot dot-short" aria-hidden="true"></span> short
      </span>
    {/if}
  </div>

  {#if cells.length === 0}
    <div class="hm-empty">no cluster data</div>
  {:else}
    <svg class="hm-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {#each cells as c, i (i)}
        {@const r = cellRect(c)}
        {@const a = intensityAlpha(c.intensity)}
        <rect
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={sideColor(c.side)}
          fill-opacity={a.toFixed(3)}
        />
      {/each}
    </svg>
  {/if}
</div>

<style>
  .heatmap {
    display: flex;
    flex-direction: column;
    padding: 6px 10px;
    font-family: var(--sc-font-mono, monospace);
    color: var(--g9, rgba(255, 255, 255, 0.85));
    background: color-mix(in oklab, currentColor 3%, transparent);
    border-radius: 3px;
  }

  .hm-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 4px;
    color: var(--g6, rgba(255, 255, 255, 0.5));
  }
  .hm-label { font-weight: 600; }

  .hm-legend { display: inline-flex; gap: 6px; align-items: center; font-size: var(--ui-text-xs); opacity: 0.7; }
  .leg-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 2px; }
  .dot-long  { background: var(--pos, #4fb872); }
  .dot-short { background: var(--neg, #d66c7a); }

  .hm-svg {
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
    border-radius: 2px;
    background: color-mix(in oklab, currentColor 2%, black 0%);
  }

  .hm-empty {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--ui-text-xs);
    color: var(--g5, rgba(255, 255, 255, 0.38));
  }
</style>
