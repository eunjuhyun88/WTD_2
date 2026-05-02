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
    bull:    { color: 'var(--sc-good, #adca7c)',   bg: 'rgba(173,202,124,0.06)' },
    bear:    { color: 'var(--sc-bad, #cf7f8f)',     bg: 'rgba(207,127,143,0.06)' },
    neutral: { color: 'var(--sc-text-2, #505078)',  bg: 'rgba(80,80,120,0.04)' },
    danger:  { color: 'var(--sc-warn, #f2d193)',    bg: 'rgba(242,209,147,0.06)' },
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
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-radius: 4px;
    padding: 8px 10px;
    min-width: 100px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    transition: border-color 0.15s;
  }

  .dc:hover {
    border-color: var(--sc-line, rgba(219,154,159,0.28));
  }

  .dc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .dc-title {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--sc-text-3, rgba(247,242,234,0.52));
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
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: var(--ui-text-xs);
    color: var(--sc-text-3, rgba(247,242,234,0.52));
    margin-top: 3px;
    letter-spacing: 0.3px;
  }
</style>
