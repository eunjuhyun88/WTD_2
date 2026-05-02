<script lang="ts">
  interface Props {
    prices: number[];
    width?: number;
    height?: number;
    positive?: boolean;
  }
  let { prices, width = 80, height = 28, positive = true }: Props = $props();

  const path = $derived.by(() => {
    if (!prices || prices.length < 2) return '';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const pad = 1;
    const w = width - pad * 2;
    const h = height - pad * 2;

    return prices
      .map((p, i) => {
        const x = pad + (i / (prices.length - 1)) * w;
        const y = pad + h - ((p - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  // Area fill path (path + close to bottom)
  const areaPath = $derived.by(() => {
    if (!path) return '';
    const pad = 1;
    const w = width - pad * 2;
    return `${path} L${(pad + w).toFixed(1)},${height - pad} L${pad},${height - pad} Z`;
  });

  const color = $derived(positive ? 'var(--sc-good, #4ade80)' : 'var(--sc-bad, #f87171)');
  const fillColor = $derived(positive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)');
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" class="sparkline">
  {#if areaPath}
    <path d={areaPath} fill={fillColor} />
  {/if}
  {#if path}
    <path d={path} fill="none" stroke={color} stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
  {/if}
</svg>

<style>
  .sparkline { display: block; flex-shrink: 0; }
</style>
