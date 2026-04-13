<script lang="ts">
  import { setActivePair } from '$lib/stores/activePairStore';

  interface Props {
    trendingData?: {
      trending?: any[];
      gainers?: any[];
      losers?: any[];
    } | null;
    onQuery?: (q: string) => void;
  }
  let { trendingData, onQuery }: Props = $props();

  const QUICK_QUERIES = [
    { id: 'buy', label: 'Buy Candidates', action: 'Show me the best buy candidates right now' },
    { id: 'wrong', label: "What's Wrong", action: 'What assets have warning signals or problems right now?' },
    { id: 'oi', label: 'High OI', action: 'Show assets with the highest open interest expansion' },
    { id: 'breakout', label: 'Breakout Watch', action: 'Which assets are near breakout conditions?' },
    { id: 'entry', label: 'Where to Buy', action: `Where are the best entry levels for ${activePairSymbol()}?` },
    { id: 'squeeze', label: 'Short Squeeze', action: 'Show assets with short squeeze potential' },
  ];

  function activePairSymbol(): string { return 'BTC/USDT'; }

  function pctColor(v: number): string {
    return v > 0 ? '#4ade80' : v < 0 ? '#f87171' : 'rgba(247,242,234,0.4)';
  }
  function formatPct(v: number): string {
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }
  function formatPrice(p: number): string {
    if (p >= 1000) return '$' + p.toLocaleString('en-US', {maximumFractionDigits: 2});
    if (p >= 1) return '$' + p.toFixed(4);
    return '$' + p.toPrecision(4);
  }

  let movers = $derived(trendingData?.trending?.slice(0, 6) ?? []);
</script>

<aside class="left-rail">
  <!-- Quick Queries -->
  <section class="rail-section">
    <h3 class="section-title">Quick Queries</h3>
    <div class="query-chips">
      {#each QUICK_QUERIES as q}
        <button class="query-chip" onclick={() => onQuery?.(q.action)}>
          {q.label}
        </button>
      {/each}
    </div>
  </section>

  <!-- Top Movers -->
  <section class="rail-section">
    <h3 class="section-title">Top Movers</h3>
    <div class="mover-list">
      {#each movers as coin}
        <button class="mover-item" onclick={() => setActivePair(coin.symbol + '/USDT')}>
          <span class="mover-sym">{coin.symbol}</span>
          <div class="mover-right">
            <span class="mover-price">{formatPrice(coin.price ?? 0)}</span>
            <span class="mover-chg" style="color:{pctColor(coin.change24h ?? 0)}">{formatPct(coin.change24h ?? 0)}</span>
          </div>
        </button>
      {/each}
      {#if movers.length === 0}
        <p class="empty-text">Loading movers…</p>
      {/if}
    </div>
  </section>

  <!-- Gainers -->
  {#if trendingData?.gainers?.length}
    <section class="rail-section">
      <h3 class="section-title">Gainers</h3>
      {#each trendingData.gainers.slice(0, 3) as coin}
        <button class="mover-item" onclick={() => setActivePair(coin.symbol + '/USDT')}>
          <span class="mover-sym">{coin.symbol}</span>
          <span class="mover-chg" style="color:#4ade80">{formatPct(coin.percentChange24h ?? coin.change24h ?? 0)}</span>
        </button>
      {/each}
    </section>
  {/if}
</aside>

<style>
  .left-rail {
    background: var(--sc-bg-0);
    border-right: 1px solid rgba(255,255,255,0.08);
    overflow-y: auto; padding: 12px 0;
    display: flex; flex-direction: column; gap: 0;
  }
  .rail-section { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .section-title {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase; color: var(--sc-text-2);
    margin: 0 0 8px;
  }
  .query-chips { display: flex; flex-direction: column; gap: 3px; }
  .query-chip {
    text-align: left; background: none; border: none; cursor: pointer;
    font-size: 12px; color: var(--sc-text-1); padding: 5px 8px;
    border-radius: 4px; transition: all 0.12s;
  }
  .query-chip:hover { background: rgba(255,255,255,0.06); color: var(--sc-text-0); }

  .mover-list { display: flex; flex-direction: column; gap: 2px; }
  .mover-item {
    display: flex; align-items: center; justify-content: space-between;
    background: none; border: none; cursor: pointer; padding: 5px 8px;
    border-radius: 4px; transition: background 0.12s;
  }
  .mover-item:hover { background: rgba(255,255,255,0.05); }
  .mover-sym { font-family: var(--sc-font-mono); font-size: 12px; font-weight: 600; color: var(--sc-text-0); }
  .mover-right { display: flex; flex-direction: column; align-items: flex-end; }
  .mover-price { font-family: var(--sc-font-mono); font-size: 11px; color: var(--sc-text-2); }
  .mover-chg { font-family: var(--sc-font-mono); font-size: 11px; font-weight: 600; }
  .empty-text { font-size: 11px; color: var(--sc-text-2); padding: 8px; }
</style>
