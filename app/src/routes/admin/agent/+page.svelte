<script lang="ts">
  import { onMount } from 'svelte';

  interface TelemetryRow {
    id: string;
    created_at: string;
    symbol: string | null;
    timeframe: string | null;
    user_message: string;
    tools_invoked: string[];
    latency_ms: number | null;
    cost_usd: number | null;
    model_id: string | null;
    user_reaction: string | null;
  }

  let rows = $state<TelemetryRow[]>([]);
  let loading = $state(true);
  let stats = $state({ total: 0, avg_latency: 0, avg_cost: 0, thumbs_down_rate: 0 });

  onMount(async () => {
    const res = await fetch('/api/admin/agent-stats');
    if (res.ok) {
      const d = await res.json() as { rows: TelemetryRow[]; stats: typeof stats };
      rows = d.rows;
      stats = d.stats;
    }
    loading = false;
  });

  function fmt(ms: number | null) { return ms ? `${ms}ms` : '—'; }
  function fmtCost(c: number | null) { return c ? `$${c.toFixed(4)}` : '—'; }
  function fmtDate(s: string) { return new Date(s).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
</script>

<div class="admin-dash">
  <h2>Agent Telemetry</h2>

  {#if loading}
    <p>Loading...</p>
  {:else}
    <div class="stats-row">
      <div class="stat"><span class="stat-label">Turns</span><span class="stat-val">{stats.total}</span></div>
      <div class="stat"><span class="stat-label">Avg Latency</span><span class="stat-val">{fmt(stats.avg_latency)}</span></div>
      <div class="stat"><span class="stat-label">Avg Cost</span><span class="stat-val">{fmtCost(stats.avg_cost)}</span></div>
      <div class="stat"><span class="stat-label">Thumbs Down Rate</span><span class="stat-val">{stats.thumbs_down_rate.toFixed(1)}%</span></div>
    </div>

    <table class="tbl">
      <thead>
        <tr>
          <th>Time</th><th>Symbol</th><th>Message</th><th>Tools</th><th>Latency</th><th>Cost</th><th>Reaction</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row}
          <tr>
            <td>{fmtDate(row.created_at)}</td>
            <td>{row.symbol ?? '—'}</td>
            <td class="msg-cell">{row.user_message.slice(0, 60)}{row.user_message.length > 60 ? '...' : ''}</td>
            <td>{(row.tools_invoked ?? []).join(', ') || '—'}</td>
            <td>{fmt(row.latency_ms)}</td>
            <td>{fmtCost(row.cost_usd)}</td>
            <td>{row.user_reaction ?? '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
.admin-dash { padding: 24px; font-family: monospace; color: #c8ccd4; }
h2 { margin: 0 0 16px; font-size: 16px; color: #fff; }
.stats-row { display: flex; gap: 24px; margin-bottom: 24px; }
.stat { display: flex; flex-direction: column; gap: 4px; }
.stat-label { font-size: 11px; color: #666; text-transform: uppercase; }
.stat-val { font-size: 20px; color: #cce8ff; }
.tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.tbl th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #2a2a3a; color: #666; font-weight: normal; text-transform: uppercase; font-size: 11px; }
.tbl td { padding: 6px 8px; border-bottom: 1px solid #1a1a2a; }
.msg-cell { max-width: 200px; }
</style>
