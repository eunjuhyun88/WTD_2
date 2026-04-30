<script lang="ts">
  import type { PnLStatsPoint } from '$lib/types/pnlStats';

  interface Props {
    points: PnLStatsPoint[];
    width?: number;
    height?: number;
  }
  const { points, width = 120, height = 32 }: Props = $props();

  const path = $derived((() => {
    if (points.length < 2) return '';
    const vals = points.map(p => p.cumulative_pnl_bps);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const xStep = width / (points.length - 1);
    return points.map((p, i) => {
      const x = i * xStep;
      const y = height - ((p.cumulative_pnl_bps - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  })());

  const isPositive = $derived(points.length > 0 && points[points.length - 1].cumulative_pnl_bps >= 0);
</script>

{#if points.length >= 2}
  <svg {width} {height} viewBox="0 0 {width} {height}" style="overflow:visible">
    <path d={path} fill="none" stroke={isPositive ? '#4ade80' : '#f87171'} stroke-width="1.5" />
  </svg>
{/if}
