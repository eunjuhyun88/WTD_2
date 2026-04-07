<script lang="ts">
  // 채팅 안에 인라인으로 들어가는 데이터 카드 위젯

  let {
    type = 'metric',
    title = '',
    value = '',
    subtext = '',
    trend = 'neutral',
    chartData = [] as number[],
  }: {
    type?: 'metric' | 'chart' | 'layers';
    title?: string;
    value?: string;
    subtext?: string;
    trend?: 'bull' | 'bear' | 'neutral' | 'danger';
    chartData?: number[];
  } = $props();

  const trendColors: Record<string, string> = {
    bull: '#22c55e',
    bear: '#ef4444',
    neutral: '#6b7280',
    danger: '#f97316',
  };

  // Mini sparkline path
  function sparklinePath(data: number[]): string {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 80;
    const h = 24;
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }
</script>

<div class="data-card {type}">
  <div class="card-title">{title}</div>
  <div class="card-body">
    <span class="card-value" style="color: {trendColors[trend]}">{value}</span>
    {#if chartData.length > 0}
      <svg class="sparkline" viewBox="0 0 80 24">
        <path d={sparklinePath(chartData)} fill="none" stroke={trendColors[trend]} stroke-width="1.5" />
      </svg>
    {/if}
  </div>
  {#if subtext}
    <div class="card-subtext">{subtext}</div>
  {/if}
</div>

<style>
  .data-card {
    background: #12121e;
    border: 1px solid #1e1e35;
    border-radius: 12px;
    padding: 12px 14px;
    min-width: 120px;
  }
  .card-title {
    font-size: 10px;
    color: #5858a0;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .card-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .card-value {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }
  .sparkline {
    width: 80px;
    height: 24px;
    flex-shrink: 0;
  }
  .card-subtext {
    font-size: 10px;
    color: #5858a0;
    margin-top: 4px;
  }
</style>
