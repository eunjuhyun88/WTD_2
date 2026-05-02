<script lang="ts">
  /**
   * WVPL Card — D2 NSM (W-0305).
   *
   * Shows current-week loop count + 4-week sparkline + M3 target (≥3) /
   * Kill (<1.0) reference lines. Component is prop-only; the page fetches
   * `/api/dashboard/wvpl` and passes data in.
   */

  type WeekBreakdown = {
    week_start: string;
    loop_count: number;
    capture_n: number;
    search_n: number;
    verdict_n: number;
  };

  type Props = {
    weeks?: WeekBreakdown[]; // most-recent first; length 1..N
    loading?: boolean;
    error?: string | null;
  };

  let { weeks = [], loading = false, error = null }: Props = $props();

  const TARGET = 3;
  const KILL = 1;

  let current = $derived(weeks[0] ?? null);
  let loopValue = $derived(current?.loop_count ?? 0);

  let trend = $derived.by((): 'good' | 'warn' | 'danger' | 'neutral' => {
    if (loopValue >= TARGET) return 'good';
    if (loopValue < KILL) return 'danger';
    if (loopValue < TARGET) return 'warn';
    return 'neutral';
  });

  let trendColor = $derived.by(() => {
    switch (trend) {
      case 'good':
        return 'var(--sc-good, #adca7c)';
      case 'warn':
        return 'var(--sc-warn, #f2d193)';
      case 'danger':
        return 'var(--sc-bad, #cf7f8f)';
      default:
        return 'var(--sc-text-2, #505078)';
    }
  });

  function sparkPath(data: number[]): string {
    if (data.length < 2) return '';
    const min = Math.min(...data, 0);
    const max = Math.max(...data, TARGET);
    const range = max - min || 1;
    return data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * 64;
        const y = 18 - ((v - min) / range) * 16;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  // Sparkline expects oldest → newest left-to-right. weeks is newest-first.
  let sparkData = $derived(
    [...weeks].reverse().map((w) => w.loop_count)
  );

  let targetY = $derived.by(() => {
    if (sparkData.length < 2) return null;
    const min = Math.min(...sparkData, 0);
    const max = Math.max(...sparkData, TARGET);
    const range = max - min || 1;
    return 18 - ((TARGET - min) / range) * 16;
  });
</script>

<div class="wvpl-card" style="--wvpl-color:{trendColor}">
  <div class="head">
    <span class="title">WEEKLY LOOPS · WVPL</span>
    {#if sparkData.length > 1}
      <svg class="spark" viewBox="0 0 64 20" aria-hidden="true">
        {#if targetY !== null}
          <line
            x1="0"
            x2="64"
            y1={targetY}
            y2={targetY}
            stroke="var(--sc-line, rgba(219,154,159,0.28))"
            stroke-dasharray="2 2"
            stroke-width="0.8"
          />
        {/if}
        <path
          d={sparkPath(sparkData)}
          fill="none"
          stroke={trendColor}
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    {/if}
  </div>

  {#if loading}
    <div class="value muted">…</div>
    <div class="sub">loading</div>
  {:else if error}
    <div class="value danger">!</div>
    <div class="sub">{error}</div>
  {:else if current}
    <div class="value">{loopValue}</div>
    <div class="sub">
      target ≥{TARGET} · kill &lt;{KILL} ·
      {current.capture_n}c / {current.search_n}s / {current.verdict_n}v
    </div>
  {:else}
    <div class="value muted">0</div>
    <div class="sub">no data this week</div>
  {/if}
</div>

<style>
  .wvpl-card {
    background: rgba(80, 80, 120, 0.04);
    border: 1px solid var(--sc-line-soft, rgba(219, 154, 159, 0.16));
    border-radius: 4px;
    padding: 10px 12px;
    min-width: 140px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    transition: border-color 0.15s;
  }

  .wvpl-card:hover {
    border-color: var(--sc-line, rgba(219, 154, 159, 0.28));
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .title {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
    text-transform: uppercase;
  }

  .spark {
    width: 64px;
    height: 20px;
    flex-shrink: 0;
  }

  .value {
    font-size: 22px;
    font-weight: 700;
    color: var(--wvpl-color);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .value.muted {
    color: var(--sc-text-3, rgba(247, 242, 234, 0.45));
  }

  .value.danger {
    color: var(--sc-bad, #cf7f8f);
  }

  .sub {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: var(--ui-text-xs);
    color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
    margin-top: 3px;
    letter-spacing: 0.3px;
  }
</style>
