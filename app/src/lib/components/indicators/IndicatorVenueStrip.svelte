<script lang="ts">
  /**
   * Archetype F — Venue Divergence Strip
   *
   * Per-venue mini multi-line showing how much each exchange's metric
   * (OI change, funding, basis) diverges from the pack.
   *
   * Alpha: "Bybit OI +8% while Binance flat" = isolated leverage pump.
   * This is the ⭐ signature feature — competitors don't aggregate + diff this way.
   */
  import type {
    IndicatorDef,
    IndicatorValue,
    VenueSeriesRow,
  } from '$lib/indicators/types';

  interface Props {
    def: IndicatorDef;
    value: IndicatorValue;
  }
  let { def, value }: Props = $props();

  const rows = $derived(
    Array.isArray(value.current) && value.current.length && 'venue' in (value.current[0] ?? {})
      ? (value.current as VenueSeriesRow[])
      : []
  );

  // Find the max absolute magnitude for bar normalization.
  const maxAbs = $derived(
    rows.reduce((m, r) => Math.max(m, Math.abs(r.current)), 0) || 1
  );

  // Divergence severity = max − min current value (high = isolated venue).
  const divergenceSeverity = $derived.by(() => {
    if (rows.length < 2) return 0;
    const vals = rows.map(r => r.current);
    return Math.max(...vals) - Math.min(...vals);
  });

  function fmt(v: number, unit = def.unit ?? ''): string {
    if (!Number.isFinite(v)) return '—';
    if (unit === '%') {
      const pct = v * 100;
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(pct >= 10 ? 1 : 2)}%`;
    }
    if (unit === 'USD') {
      const abs = Math.abs(v);
      if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
      if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
      return `$${v.toFixed(0)}`;
    }
    return v.toFixed(3);
  }

  function sparkPath(series: number[], w = 48, h = 10): string {
    if (!series || series.length < 2) return '';
    const min = Math.min(...series), max = Math.max(...series);
    const range = max - min || 1;
    return series
      .map((v, i) => {
        const x = (i / (series.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
</script>

<div class="strip" title={def.description ?? def.label ?? def.id}>
  <div class="header">
    <span class="label">{def.label ?? def.id}</span>
    {#if divergenceSeverity > 0}
      <span class="div-badge" class:strong={divergenceSeverity > 0.05}>
        Δ {fmt(divergenceSeverity, '%')}
      </span>
    {/if}
  </div>

  <div class="rows">
    {#each rows as row (row.venue)}
      {@const magnitude = Math.abs(row.current) / maxAbs}
      {@const barWidth = Math.round(magnitude * 100)}
      <div class="row" class:hl={row.highlight}>
        <span class="venue">{row.label ?? row.venue}</span>
        <div class="bar-cell">
          <div class="bar" class:neg={row.current < 0} style="width: {barWidth}%"></div>
        </div>
        <span class="val">{fmt(row.current)}</span>
        {#if row.sparkline?.length}
          <svg class="mini" viewBox="0 0 48 10" aria-hidden="true">
            <path d={sparkPath(row.sparkline)} />
          </svg>
        {/if}
      </div>
    {/each}
    {#if rows.length === 0}
      <div class="empty">no venue data</div>
    {/if}
  </div>
</div>

<style>
  .strip {
    font-family: var(--sc-font-mono, ui-monospace, monospace);
    font-size: var(--ui-text-xs);
    line-height: 1.2;
    color: var(--g9, rgba(255, 255, 255, 0.85));
    padding: 6px 10px;
    min-width: 220px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .label {
    font-size: var(--ui-text-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--g6, rgba(255, 255, 255, 0.5));
  }

  .div-badge {
    font-size: var(--ui-text-xs);
    padding: 1px 5px;
    border-radius: 2px;
    background: color-mix(in oklab, var(--amb, #f0b847) 14%, transparent);
    color: var(--amb, #f0b847);
    letter-spacing: 0.02em;
  }
  .div-badge.strong {
    background: color-mix(in oklab, var(--amb, #f0b847) 28%, transparent);
    animation: ind-pulse 2s ease-in-out infinite;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row {
    display: grid;
    grid-template-columns: 58px 1fr 48px 48px;
    align-items: center;
    gap: 6px;
    padding: 1px 0;
  }
  .row.hl {
    color: var(--amb, #f0b847);
  }

  .venue {
    letter-spacing: 0.03em;
    text-transform: capitalize;
    font-size: var(--ui-text-xs);
    color: inherit;
  }

  .bar-cell {
    height: 4px;
    background: color-mix(in oklab, currentColor 10%, transparent);
    border-radius: 2px;
    overflow: hidden;
    position: relative;
  }

  .bar {
    height: 100%;
    background: currentColor;
    border-radius: 2px;
    opacity: 0.75;
    transition: width 200ms ease;
  }
  .bar.neg { background: var(--neg, #d66c7a); opacity: 0.65; }

  .val {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: var(--ui-text-xs);
  }

  .mini {
    width: 48px;
    height: 10px;
    opacity: 0.6;
  }
  .mini path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
  }

  .empty {
    color: var(--g5);
    font-size: var(--ui-text-xs);
    padding: 8px 0;
    text-align: center;
  }

  @keyframes ind-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.55; }
  }
</style>
