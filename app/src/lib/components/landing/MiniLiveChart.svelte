<script lang="ts">
  import { onMount } from 'svelte';

  let candles = $state<{ close: number; time: number }[]>([]);
  let loading = $state(true);

  async function fetchCandles() {
    try {
      const res = await fetch(
        'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=60',
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return;
      const raw: [number, string, string, string, string][] = await res.json();
      candles = raw.map(([time, , , , close]) => ({
        time,
        close: parseFloat(close)
      }));
    } catch {
      // silent fail
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchCandles();
    const t = setInterval(fetchCandles, 30_000);
    return () => clearInterval(t);
  });

  const W = 320;
  const H = 80;

  const line = $derived((() => {
    if (candles.length < 2) return '';
    const prices = candles.map((c) => c.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    return candles
      .map((c, i) => {
        const x = (i / (candles.length - 1)) * W;
        const y = H - ((c.close - min) / range) * (H - 8) - 4;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  })());

  const lastPrice = $derived(candles[candles.length - 1]?.close ?? null);
  const firstPrice = $derived(candles[0]?.close ?? null);
  const isUp = $derived(lastPrice !== null && firstPrice !== null && lastPrice >= firstPrice);
</script>

{#if loading}
  <div class="chart-skeleton" aria-hidden="true"></div>
{:else if candles.length > 0}
  <div class="mini-chart" role="img" aria-label="BTC/USDT 1분봉 스파크라인">
    <svg viewBox="0 0 {W} {H}" class="sparkline" aria-hidden="true">
      <path
        d={line}
        fill="none"
        stroke={isUp ? 'var(--pos, #4ade80)' : 'var(--neg, #f87171)'}
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <div class="chart-label">
      <span class="chart-symbol">BTC/USDT</span>
      {#if lastPrice !== null}
        <span class="chart-price" class:up={isUp} class:down={!isUp}>
          ${lastPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .chart-skeleton {
    width: 320px;
    height: 100px;
    background: var(--g2, #131110);
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }

  .mini-chart {
    width: 320px;
    border: 1px solid var(--g3, #1c1918);
    border-radius: 4px;
    overflow: hidden;
    background: var(--g2, #131110);
  }

  .sparkline {
    display: block;
    width: 100%;
    height: 80px;
  }

  .chart-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
  }

  .chart-symbol {
    color: var(--g7, #9d9690);
  }

  .chart-price.up {
    color: var(--pos, #4ade80);
  }

  .chart-price.down {
    color: var(--neg, #f87171);
  }

  @media (max-width: 640px) {
    .mini-chart,
    .chart-skeleton {
      display: none;
    }
  }
</style>
