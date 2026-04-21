<script lang="ts">
  /**
   * Archetype A — Percentile Gauge + Sparkline
   *
   * Renders: current value + position on [p5..p95] band + 24h sparkline.
   * Used for single-value metrics that need context (OI change, funding, volume, skew).
   *
   * Visual rule: p50 region is colorless. Only p75+ gets amber tint.
   * This forces the trader's eye to extremes only.
   */
  import type { IndicatorDef, IndicatorValue } from '$lib/indicators/types';
  import { classifyPercentile } from '$lib/indicators/types';

  interface Props {
    def: IndicatorDef;
    value: IndicatorValue;
  }
  let { def, value }: Props = $props();

  const current = $derived(typeof value.current === 'number' ? value.current : NaN);
  const percentile = $derived(value.percentile?.value ?? 50);
  const tier = $derived(classifyPercentile(percentile, def.thresholds));
  const sparkline = $derived(value.sparkline ?? []);

  // ── Number formatting by unit ─────────────────────────────────────────
  const formatted = $derived.by(() => {
    if (!Number.isFinite(current)) return '—';
    const unit = def.unit;
    if (unit === '%') {
      const pct = current * 100;
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(pct >= 10 ? 1 : 2)}%`;
    }
    if (unit === 'x') return `${current.toFixed(2)}x`;
    if (unit === 'USD') {
      const abs = Math.abs(current);
      if (abs >= 1e9) return `${(current / 1e9).toFixed(1)}B`;
      if (abs >= 1e6) return `${(current / 1e6).toFixed(1)}M`;
      if (abs >= 1e3) return `${(current / 1e3).toFixed(1)}k`;
      return current.toFixed(0);
    }
    if (unit === 'σ') return `${current >= 0 ? '+' : ''}${current.toFixed(2)}σ`;
    // Default: shrink long decimals
    const abs = Math.abs(current);
    if (abs < 0.01) return current.toFixed(4);
    if (abs < 1) return current.toFixed(3);
    if (abs < 100) return current.toFixed(2);
    return current.toFixed(1);
  });

  // ── Sparkline path ────────────────────────────────────────────────────
  const sparkPath = $derived.by(() => {
    if (sparkline.length < 2) return '';
    const w = 48, h = 14;
    const min = Math.min(...sparkline);
    const max = Math.max(...sparkline);
    const range = max - min || 1;
    return sparkline
      .map((v, i) => {
        const x = (i / (sparkline.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  // Gauge dot position on p5..p95 band
  const dotLeft = $derived(Math.max(0, Math.min(100, percentile)));
</script>

<div class="gauge tier-{tier}" title={def.description ?? def.label ?? def.id}>
  <div class="label">{def.label ?? def.id}</div>

  <div class="value-row">
    <span class="value">{formatted}</span>
    {#if sparkPath}
      <svg class="spark" viewBox="0 0 48 14" aria-hidden="true">
        <path d={sparkPath} />
      </svg>
    {/if}
  </div>

  <div class="gauge-track" aria-hidden="true">
    <div class="gauge-dot" style="left: {dotLeft}%"></div>
  </div>

  {#if value.percentile}
    <div class="pct">p{Math.round(value.percentile.value)}·{value.percentile.window}</div>
  {/if}
</div>

<style>
  .gauge {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    font-family: var(--sc-font-mono, ui-monospace, monospace);
    font-size: 11px;
    line-height: 1.15;
    min-width: 96px;
    color: var(--g9, rgba(255, 255, 255, 0.85));
  }

  .label {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--g6, rgba(255, 255, 255, 0.5));
  }

  .value-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }

  .spark {
    width: 48px;
    height: 14px;
    flex-shrink: 0;
  }
  .spark path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    opacity: 0.75;
  }

  .gauge-track {
    position: relative;
    height: 3px;
    background: color-mix(in oklab, currentColor 12%, transparent);
    border-radius: 1.5px;
    margin-top: 1px;
  }

  .gauge-dot {
    position: absolute;
    top: -1px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    transform: translateX(-50%);
  }

  .pct {
    font-size: 9px;
    color: var(--g5, rgba(255, 255, 255, 0.38));
    letter-spacing: 0.03em;
  }

  /* ── Threshold color tiers ──────────────────────────────────────────── */
  .tier-neutral {
    /* no color — forces eye to extremes only */
    color: var(--g9, rgba(255, 255, 255, 0.85));
  }
  .tier-warn {
    color: color-mix(in oklab, var(--amb, #f0b847) 75%, var(--g9));
  }
  .tier-extreme {
    color: var(--amb, #f0b847);
  }
  .tier-historical {
    color: var(--amb, #f0b847);
    animation: ind-pulse 2s ease-in-out infinite;
  }

  @keyframes ind-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.55; }
  }
</style>
