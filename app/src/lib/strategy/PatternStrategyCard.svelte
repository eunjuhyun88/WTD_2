<script lang="ts">
  import type { PatternBacktestStats, PatternObjectRow } from '$lib/api/strategyBackend';

  interface Props {
    pattern: PatternObjectRow;
    stats: PatternBacktestStats | null;
    loading: boolean;
    locked?: boolean;
    onclick?: () => void;
  }

  let { pattern, stats, loading, locked = false, onclick }: Props = $props();

  function pct(v: number | null | undefined, decimals = 1): string {
    if (v == null) return '—';
    return (v * 100).toFixed(decimals) + '%';
  }

  function fmt(v: number | null | undefined, decimals = 2): string {
    if (v == null) return '—';
    const s = v.toFixed(decimals);
    return v > 0 ? '+' + s : s;
  }

  function svgSparkline(curve: number[]): string {
    if (curve.length < 2) return '';
    const W = 80, H = 32;
    const min = Math.min(...curve);
    const max = Math.max(...curve);
    const range = max - min || 1;
    const pts = curve.map((v, i) => {
      const x = (i / (curve.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return pts.join(' ');
  }

  const isPositive = $derived(
    stats?.apr != null ? stats.apr > 0 : stats?.avg_return_72h != null ? stats.avg_return_72h > 0 : null,
  );
</script>

<button
  class="strategy-card"
  class:locked
  class:positive={isPositive === true}
  class:negative={isPositive === false}
  onclick={locked ? undefined : onclick}
  type="button"
>
  {#if locked}
    <div class="lock-overlay">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="3" y="6" width="8" height="7" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
        <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <span>Pro</span>
    </div>
  {/if}

  <div class="card-top">
    <div class="card-meta">
      <span class="card-slug">{pattern.slug.replace(/-v\d+$/, '')}</span>
      <span class="card-tf">{pattern.timeframe}</span>
    </div>
    {#if !loading && stats && stats.equity_curve.length >= 2}
      <svg class="sparkline" width="80" height="32" viewBox="0 0 80 32" aria-hidden="true">
        <polyline
          points={svgSparkline(stats.equity_curve)}
          fill="none"
          stroke={isPositive ? 'var(--sc-green, #4caf7d)' : 'var(--sc-red, #e05c5c)'}
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    {:else if loading}
      <div class="sparkline-skeleton"></div>
    {/if}
  </div>

  <div class="card-stats">
    <div class="stat">
      <span class="stat-label">APR</span>
      <span class="stat-value" class:pos={stats?.apr != null && stats.apr > 0}
            class:neg={stats?.apr != null && stats.apr < 0}>
        {loading ? '…' : pct(stats?.apr)}
      </span>
    </div>
    <div class="stat">
      <span class="stat-label">Win</span>
      <span class="stat-value">{loading ? '…' : pct(stats?.win_rate)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Sharpe</span>
      <span class="stat-value">{loading ? '…' : fmt(stats?.sharpe)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">n</span>
      <span class="stat-value">{loading ? '…' : (stats?.n_signals ?? '—')}</span>
    </div>
  </div>

  {#if !loading && stats?.insufficient_data}
    <div class="warn-badge">데이터 부족</div>
  {/if}
</button>

<style>
  .strategy-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--g1, #111);
    border: 1px solid var(--g3, #2a2a2a);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
    overflow: hidden;
    width: 100%;
  }
  .strategy-card:hover:not(.locked) {
    border-color: var(--g5, #444);
    background: var(--g2, #181818);
  }
  .strategy-card.locked {
    cursor: default;
    opacity: 0.55;
  }
  .lock-overlay {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: var(--g6, #888);
  }
  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .card-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .card-slug {
    font-size: 11px;
    font-weight: 600;
    color: var(--g9, #f0f0f0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
  }
  .card-tf {
    font-size: 10px;
    color: var(--g5, #666);
  }
  .sparkline { flex-shrink: 0; }
  .sparkline-skeleton {
    width: 80px; height: 32px;
    background: var(--g2, #1a1a1a);
    border-radius: 4px;
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
  .card-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .stat-label {
    font-size: 9px;
    color: var(--g5, #666);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .stat-value {
    font-size: 11px;
    font-weight: 600;
    color: var(--g8, #ccc);
    font-variant-numeric: tabular-nums;
  }
  .stat-value.pos { color: var(--sc-green, #4caf7d); }
  .stat-value.neg { color: var(--sc-red, #e05c5c); }
  .warn-badge {
    font-size: 9px;
    color: var(--g5, #888);
    background: var(--g2, #1a1a1a);
    border: 1px solid var(--g3, #2a2a2a);
    border-radius: 3px;
    padding: 1px 5px;
    align-self: flex-start;
  }
</style>
