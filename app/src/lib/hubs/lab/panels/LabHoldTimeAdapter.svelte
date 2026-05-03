<script lang="ts">
  import HoldTimeStrip from '$lib/components/shared/HoldTimeStrip.svelte';
  import type { TradeRecord } from '$lib/contracts/backtest';

  interface Props {
    trades: TradeRecord[];
  }
  let { trades }: Props = $props();

  /** Linear-interpolation percentile on a sorted array */
  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  const p50 = $derived.by(() => {
    if (trades.length === 0) return null;
    const hours = trades
      .map((t) => (t.exitTime - t.entryTime) / 3_600_000)
      .sort((a, b) => a - b);
    return percentile(hours, 50);
  });

  const p90 = $derived.by(() => {
    if (trades.length === 0) return null;
    const hours = trades
      .map((t) => (t.exitTime - t.entryTime) / 3_600_000)
      .sort((a, b) => a - b);
    return percentile(hours, 90);
  });
</script>

<HoldTimeStrip {p50} {p90} />
