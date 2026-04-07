<script lang="ts">
  let {
    title = '',
    value = '',
    subtext = '',
    trend = 'neutral',
    chartData = [] as number[],
  }: {
    type?: string;
    title?: string;
    value?: string;
    subtext?: string;
    trend?: 'bull' | 'bear' | 'neutral' | 'danger';
    chartData?: number[];
  } = $props();

  const trendMap: Record<string, { color: string; bg: string }> = {
    bull:    { color: 'var(--cg-cyan, #00e5ff)',   bg: 'rgba(0,229,255,0.06)' },
    bear:   { color: 'var(--cg-red, #ff3860)',     bg: 'rgba(255,56,96,0.06)' },
    neutral: { color: 'var(--cg-text-dim, #505078)', bg: 'rgba(80,80,120,0.06)' },
    danger: { color: 'var(--cg-orange, #ff9f43)',  bg: 'rgba(255,159,67,0.06)' },
  };

  function sparkPath(data: number[]): string {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * 64;
      const y = 18 - ((v - min) / range) * 16;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  // trend style derived inline in template via {@const}
</script>

{#if true}
  {@const t = trendMap[trend] || trendMap.neutral}
  <div class="dc" style="--dc-color:{t.color};--dc-bg:{t.bg}">
    <div class="dc-head">
      <span class="dc-title">{title}</span>
      {#if chartData.length > 0}
        <svg class="dc-spark" viewBox="0 0 64 20">
          <path d={sparkPath(chartData)} fill="none" stroke={t.color} stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6" />
        </svg>
      {/if}
    </div>
    <div class="dc-val">{value}</div>
    {#if subtext}
      <div class="dc-sub">{subtext}</div>
    {/if}
  </div>
{/if}

<style>
  .dc {
    background: var(--dc-bg);
    border: 1px solid var(--cg-border, #16162a);
    border-radius: 4px;
    padding: 8px 10px;
    min-width: 100px;
    flex: 1;
    font-family: var(--font-mono, 'IBM Plex Mono', monospace);
    transition: border-color 0.15s;
  }

  .dc:hover {
    border-color: var(--cg-border-strong, #1e1e38);
  }

  .dc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .dc-title {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--cg-text-muted, #383860);
    text-transform: uppercase;
  }

  .dc-spark {
    width: 48px;
    height: 16px;
    flex-shrink: 0;
  }

  .dc-val {
    font-size: 16px;
    font-weight: 700;
    color: var(--dc-color);
    letter-spacing: -0.5px;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .dc-sub {
    font-size: 8px;
    color: var(--cg-text-dim, #505078);
    margin-top: 3px;
    letter-spacing: 0.3px;
  }
</style>
