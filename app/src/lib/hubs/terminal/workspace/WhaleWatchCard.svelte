<script lang="ts">
  import { whaleStore } from '$lib/stores/whaleStore';

  interface Props {
    symbol?: string;
    /** Auto-refresh interval in ms (0 = manual only) */
    refreshInterval?: number;
  }

  let { symbol = 'BTCUSDT', refreshInterval = 60_000 }: Props = $props();

  // Fetch on mount + symbol change
  $effect(() => {
    void symbol;
    whaleStore.fetch(symbol);
  });

  // Auto-refresh
  $effect(() => {
    if (!refreshInterval) return;
    const id = setInterval(() => whaleStore.fetch(symbol), refreshInterval);
    return () => clearInterval(id);
  });

  const positions = $derived($whaleStore.positions);
  const loading   = $derived($whaleStore.loading);
  const error     = $derived($whaleStore.error);

  function fmtUsd(v: number): string {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  }

  function fmtPnl(v: number | null): string {
    if (v == null) return '—';
    return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  }
</script>

<div class="whale-card">
  <div class="whale-head">
    <span class="whale-label">🐋 WHALE WATCH</span>
    {#if loading}
      <span class="whale-spinner">·</span>
    {/if}
    <span class="whale-sym">{symbol.replace('USDT', '')} · HL</span>
  </div>

  <div class="whale-body">
    {#if error}
      <div class="whale-empty">Data unavailable</div>
    {:else if positions.length === 0 && !loading}
      <div class="whale-empty">No whale data</div>
    {:else}
      {#each positions.slice(0, 7) as pos}
        <div class="whale-row">
          <!-- Direction indicator -->
          <span
            class="whale-dir"
            class:dir-long={pos.netPosition === 'long'}
            class:dir-short={pos.netPosition === 'short'}
            title={pos.netPosition}
          >
            {pos.netPosition === 'long' ? '▲' : pos.netPosition === 'short' ? '▼' : '—'}
          </span>

          <!-- Truncated address -->
          <a
            class="whale-addr"
            href="https://app.hyperliquid.xyz/explorer/address/{pos.addressFull}"
            target="_blank"
            rel="noopener noreferrer"
            title={pos.addressFull}
          >{pos.address}</a>

          <!-- Account size -->
          <span class="whale-size">{fmtUsd(pos.sizeUsd)}</span>

          <!-- 30d PnL -->
          <span
            class="whale-pnl"
            class:pnl-pos={pos.pnl30dPct != null && pos.pnl30dPct >= 0}
            class:pnl-neg={pos.pnl30dPct != null && pos.pnl30dPct < 0}
          >{fmtPnl(pos.pnl30dPct)}</span>

          <!-- Liq price (if available) -->
          {#if pos.liquidationPrice != null}
            <span class="whale-liq" title="Est. liquidation price">
              Liq {pos.liquidationPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .whale-card {
    background: var(--tv-bg-1, #131722);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
  }

  /* Header */
  .whale-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.012);
  }
  .whale-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.35);
  }
  .whale-sym {
    margin-left: auto;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.22);
  }
  .whale-spinner {
    font-size: 12px;
    color: rgba(255,199,80,0.55);
    animation: pulse 1s infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

  /* Body */
  .whale-body {
    padding: 2px 0;
  }
  .whale-empty {
    padding: 6px 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.20);
  }

  /* Rows */
  .whale-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.025);
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
  }
  .whale-row:last-child { border-bottom: none; }
  .whale-row:hover { background: rgba(255,255,255,0.025); }

  .whale-dir {
    font-size: 8px;
    width: 10px;
    flex-shrink: 0;
    color: rgba(255,255,255,0.3);
  }
  .whale-dir.dir-long  { color: #22ab94; }
  .whale-dir.dir-short { color: #f23645; }

  .whale-addr {
    flex: 1;
    color: rgba(75,158,253,0.75);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9px;
  }
  .whale-addr:hover { color: #4b9efd; text-decoration: underline; }

  .whale-size {
    flex-shrink: 0;
    color: rgba(255,255,255,0.62);
    font-weight: 600;
  }

  .whale-pnl {
    flex-shrink: 0;
    font-weight: 600;
    color: rgba(255,255,255,0.35);
  }
  .whale-pnl.pnl-pos { color: #22ab94; }
  .whale-pnl.pnl-neg { color: #f23645; }

  .whale-liq {
    flex-shrink: 0;
    font-size: 8px;
    color: rgba(255,199,80,0.55);
    white-space: nowrap;
  }
</style>
