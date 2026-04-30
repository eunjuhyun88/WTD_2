<script lang="ts">
  interface Series {
    slug: string;
    curve: number[];
    color: string;
  }

  interface Props {
    series: Series[];
    btcCurve?: number[];
    height?: number;
  }

  let { series, btcCurve, height = 240 }: Props = $props();

  const W = 600;

  const COLORS = [
    '#db9a9f', '#7ec8e3', '#a8e6b4', '#ffd18c', '#c3b1e1',
  ];

  function buildPath(curve: number[], allMin: number, allMax: number, h: number): string {
    if (curve.length < 2) return '';
    const range = allMax - allMin || 1;
    return curve
      .map((v, i) => {
        const x = (i / (curve.length - 1)) * W;
        const y = h - ((v - allMin) / range) * (h - 20) - 10;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const allValues = $derived(() => {
    const vals: number[] = [];
    series.forEach(s => vals.push(...s.curve));
    if (btcCurve) vals.push(...btcCurve);
    return vals;
  });

  const globalMin = $derived(Math.min(...allValues()));
  const globalMax = $derived(Math.max(...allValues()));
  const baselineY = $derived(
    height - ((1.0 - globalMin) / (globalMax - globalMin || 1)) * (height - 20) - 10,
  );
</script>

<div class="benchmark-chart-wrap">
  <svg
    class="benchmark-svg"
    viewBox="0 0 {W} {height}"
    preserveAspectRatio="xMidYMid meet"
    aria-label="Benchmark equity curves"
  >
    <!-- Baseline at 1.0 -->
    <line x1="0" y1={baselineY} x2={W} y2={baselineY} stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="4 4"/>

    <!-- BTC hold baseline -->
    {#if btcCurve && btcCurve.length >= 2}
      <path
        d={buildPath(btcCurve, globalMin, globalMax, height)}
        fill="none"
        stroke="rgba(247,147,26,0.45)"
        stroke-width="1.5"
        stroke-dasharray="6 3"
      />
    {/if}

    <!-- Pattern curves -->
    {#each series as s, i}
      {#if s.curve.length >= 2}
        <path
          d={buildPath(s.curve, globalMin, globalMax, height)}
          fill="none"
          stroke={COLORS[i % COLORS.length]}
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {/if}
    {/each}
  </svg>

  <!-- Legend -->
  <div class="legend">
    {#each series as s, i}
      <div class="legend-item">
        <span class="legend-dot" style="background:{COLORS[i % COLORS.length]}"></span>
        <span class="legend-label">{s.slug.replace(/-v\d+$/, '')}</span>
      </div>
    {/each}
    {#if btcCurve}
      <div class="legend-item">
        <span class="legend-dot" style="background:rgba(247,147,26,0.6)"></span>
        <span class="legend-label">BTC Hold</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .benchmark-chart-wrap { display: flex; flex-direction: column; gap: 10px; }
  .benchmark-svg { width: 100%; border-radius: 6px; background: var(--g1, #0e0e0e); }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; }
  .legend-item { display: flex; align-items: center; gap: 5px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .legend-label { font-size: 10px; color: var(--g6, #888); }
</style>
