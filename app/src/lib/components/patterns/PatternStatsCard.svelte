<script lang="ts">
  import type { PnLStats } from '$lib/types/pnlStats';

  interface Props {
    stats: PnLStats | null;
    loading?: boolean;
  }
  const { stats, loading = false }: Props = $props();

  function fmtBps(v: number | null): string {
    if (v === null) return '—';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}bps`;
  }
  function fmtPct(v: number | null): string {
    if (v === null) return '—';
    return `${(v * 100).toFixed(1)}%`;
  }
</script>

<div class="pnl-stats-card">
  {#if loading}
    <div class="loading">loading...</div>
  {:else if !stats || stats.n === 0}
    <div class="empty">No P&L data yet</div>
  {:else}
    <div class="header">
      <span class="label">P&L Stats</span>
      {#if stats.preliminary}
        <span class="badge preliminary">preliminary · N={stats.n}</span>
      {:else}
        <span class="badge">N={stats.n}</span>
      {/if}
    </div>
    <div class="grid">
      <div class="stat">
        <span class="stat-label">Mean net</span>
        <span class="stat-val" class:positive={stats.mean_pnl_bps !== null && stats.mean_pnl_bps > 0}
              class:negative={stats.mean_pnl_bps !== null && stats.mean_pnl_bps <= 0}>
          {fmtBps(stats.mean_pnl_bps)}
        </span>
      </div>
      <div class="stat">
        <span class="stat-label">Win rate</span>
        <span class="stat-val">{fmtPct(stats.win_rate)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Sharpe</span>
        <span class="stat-val">{stats.sharpe_like !== null ? stats.sharpe_like.toFixed(2) : '—'}</span>
      </div>
      <div class="stat">
        <span class="stat-label">INDET</span>
        <span class="stat-val">{fmtPct(stats.indeterminate_rate)}</span>
      </div>
    </div>
    {#if !stats.preliminary && stats.ci_low !== null && stats.ci_high !== null}
      <div class="ci">95% CI: {fmtBps(stats.ci_low)} ~ {fmtBps(stats.ci_high)}</div>
    {/if}
  {/if}
</div>

<style>
  .pnl-stats-card {
    padding: 12px 14px;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    background: rgba(255,255,255,0.02);
  }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .label { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; }
  .badge { font-size: var(--ui-text-xs); padding: 2px 6px; border-radius: 3px; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); }
  .badge.preliminary { background: rgba(255,200,0,0.12); color: rgba(255,200,0,0.8); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .stat { display: flex; flex-direction: column; gap: 2px; }
  .stat-label { font-size: var(--ui-text-xs); color: rgba(255,255,255,0.35); }
  .stat-val { font-family: var(--sc-font-mono, monospace); font-size: 13px; color: rgba(255,255,255,0.8); }
  .stat-val.positive { color: #4ade80; }
  .stat-val.negative { color: #f87171; }
  .ci { margin-top: 8px; font-size: var(--ui-text-xs); color: rgba(255,255,255,0.3); font-family: monospace; }
  .loading, .empty { font-size: 12px; color: rgba(255,255,255,0.3); text-align: center; padding: 8px 0; }
</style>
