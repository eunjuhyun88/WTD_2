<script lang="ts">
  import type { PnLStats } from '$lib/types/pnlStats';

  interface Props { stats: PnLStats | null; }
  const { stats }: Props = $props();

  const rows = $derived(stats?.equity_curve ?? []);

  function fmtDate(ts: string) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="trade-history">
  {#if rows.length === 0}
    <p class="empty">No trades recorded yet.</p>
  {:else}
    <table>
      <thead>
        <tr><th>#</th><th>Date</th><th>Cumulative P&L</th></tr>
      </thead>
      <tbody>
        {#each rows as row, i}
          <tr>
            <td>{i + 1}</td>
            <td>{fmtDate(row.ts)}</td>
            <td class:pos={row.cumulative_pnl_bps >= 0} class:neg={row.cumulative_pnl_bps < 0}>
              {row.cumulative_pnl_bps > 0 ? '+' : ''}{row.cumulative_pnl_bps.toFixed(1)}bps
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .trade-history { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 6px 8px; color: rgba(255,255,255,0.4); font-weight: 400; border-bottom: 1px solid rgba(255,255,255,0.06); }
  td { padding: 6px 8px; color: rgba(255,255,255,0.7); border-bottom: 1px solid rgba(255,255,255,0.04); }
  td.pos { color: #4ade80; }
  td.neg { color: #f87171; }
  .empty { font-size: 12px; color: rgba(255,255,255,0.3); text-align: center; padding: 16px 0; }
</style>
