<script lang="ts">
  /**
   * TerminalHoldTimeAdapter
   *
   * Polls /api/captures/watch-hits every 60s, computes p50/p90 of hold times
   * (hours elapsed since captured_at_ms), and exposes them via `onStats` callback.
   *
   * Hold time = (now - captured_at_ms) / 3_600_000  (hours)
   */

  interface Props {
    onStats: (p50: number | null, p90: number | null) => void;
  }

  const { onStats }: Props = $props();

  interface WatchHitRaw {
    captured_at_ms?: number;
    [key: string]: unknown;
  }

  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  async function fetchAndCompute(): Promise<void> {
    try {
      const res = await fetch('/api/captures/watch-hits?limit=50');
      if (!res.ok) {
        onStats(null, null);
        return;
      }
      const data = await res.json() as { items?: WatchHitRaw[] };
      const items = data.items ?? [];

      if (items.length === 0) {
        onStats(null, null);
        return;
      }

      const nowMs = Date.now();
      const holdHours = items
        .map((it) => {
          const ms = it.captured_at_ms ?? 0;
          return ms > 0 ? (nowMs - ms) / 3_600_000 : null;
        })
        .filter((h): h is number => h !== null && h >= 0)
        .sort((a, b) => a - b);

      if (holdHours.length === 0) {
        onStats(null, null);
        return;
      }

      const p50 = percentile(holdHours, 50);
      const p90 = percentile(holdHours, 90);
      onStats(
        Math.round(p50 * 10) / 10,
        Math.round(p90 * 10) / 10,
      );
    } catch {
      onStats(null, null);
    }
  }

  $effect(() => {
    fetchAndCompute();
    const t = setInterval(fetchAndCompute, 60_000);
    return () => clearInterval(t);
  });
</script>
