<script lang="ts">
  import { setActivePair } from '$lib/stores/activePairStore';

  interface AlertRow {
    id: string;
    symbol: string;
    timeframe: string;
    blocks_triggered: string[];
    p_win: number | null;
    created_at: string;
    preview: { price?: number; rsi14?: number; funding_rate?: number; regime?: string };
  }

  interface PatternPhaseRow {
    slug: string;
    phaseName: string;
    symbols: string[];
    daysIn?: number;
  }

  interface Props {
    trendingData?: {
      trending?: any[];
      gainers?: any[];
      losers?: any[];
    } | null;
    alerts?: AlertRow[];
    patternPhases?: PatternPhaseRow[];
    activeSymbol?: string;
    onQuery?: (q: string) => void;
  }
  let { trendingData, alerts = [], patternPhases = [], activeSymbol = '', onQuery }: Props = $props();

  const QUICK_QUERIES = [
    { id: 'buy',      label: 'Buy Candidates', action: 'Show me the best buy candidates right now' },
    { id: 'wrong',    label: "What's Wrong",   action: 'What assets have warning signals right now?' },
    { id: 'oi',       label: 'High OI',        action: 'Show assets with the highest open interest expansion' },
    { id: 'breakout', label: 'Breakout Watch', action: 'Which assets are near breakout conditions?' },
    { id: 'squeeze',  label: 'Short Squeeze',  action: 'Show assets with short squeeze potential' },
  ];

  function pctColor(v: number): string {
    return v > 0 ? '#4ade80' : v < 0 ? '#f87171' : 'rgba(247,242,234,0.4)';
  }
  function formatPct(v: number): string {
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }
  function formatPrice(p: number): string {
    if (p >= 1000) return '$' + p.toLocaleString('en-US', {maximumFractionDigits: 2});
    if (p >= 1)    return '$' + p.toFixed(4);
    return '$' + p.toPrecision(4);
  }
  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }
  function blockLabel(b: string): string {
    return b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  let movers = $derived(trendingData?.trending?.slice(0, 6) ?? []);
  let recentAlerts = $derived(alerts.slice(0, 8));
</script>

<aside class="left-rail">

  <!-- Pattern Engine -->
  {#if patternPhases.length > 0}
  <section class="rail-section pattern-section">
    <h3 class="section-title">
      <span class="section-dot">●</span>
      Pattern Engine
      <a href="/patterns" class="section-link">all →</a>
    </h3>
    {#each patternPhases as row}
      <div class="pattern-row">
        <div class="pattern-top">
          <span class="pattern-slug">{row.slug.replace('tradoor-','').replace('-v1','').toUpperCase()}</span>
          <span class="pattern-phase phase-{row.phaseName.toLowerCase()}">{row.phaseName}</span>
        </div>
        <div class="pattern-syms">
          {#each row.symbols.slice(0,4) as sym}
            <button
              class="sym-chip"
              class:active={activeSymbol === sym + 'USDT' || activeSymbol === sym}
              onclick={() => onQuery?.(`Analyze ${sym}USDT`)}
            >
              {sym}
            </button>
          {/each}
          {#if row.symbols.length > 4}
            <span class="sym-more">+{row.symbols.length - 4}</span>
          {/if}
        </div>
      </div>
    {/each}
  </section>
  {/if}

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

  <!-- Scanner Alerts -->
  <section class="rail-section">
    <h3 class="section-title">
      Scanner Alerts
      {#if recentAlerts.length > 0}
        <span class="alert-count">{recentAlerts.length}</span>
      {/if}
    </h3>
    <div class="alert-list">
      {#each recentAlerts as alert}
        <button class="alert-item" onclick={() => {
          setActivePair(alert.symbol.replace('USDT','') + '/USDT');
          onQuery?.(`Analyze ${alert.symbol} — triggered: ${alert.blocks_triggered.slice(0,2).join(', ')}`);
        }}>
          <div class="alert-top">
            <span class="alert-sym">{alert.symbol.replace('USDT','')}</span>
            <span class="alert-tf">{alert.timeframe}</span>
            {#if alert.p_win != null}
              <span class="alert-pwin" class:good={alert.p_win >= 0.58}>{(alert.p_win * 100).toFixed(0)}%</span>
            {/if}
            <span class="alert-time">{relativeTime(alert.created_at)}</span>
          </div>
          <p class="alert-blocks">
            {alert.blocks_triggered.slice(0, 3).map(blockLabel).join(' · ')}
          </p>
        </button>
      {/each}
      {#if recentAlerts.length === 0}
        <p class="empty-text">No alerts yet — scanner runs every 15 min</p>
      {/if}
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

  /* Scanner Alerts */
  .alert-count {
    font-size: 9px; font-weight: 700; background: rgba(251,191,36,0.2);
    color: #fbbf24; border-radius: 10px; padding: 1px 5px; margin-left: 4px;
  }
  .alert-list { display: flex; flex-direction: column; gap: 3px; }
  .alert-item {
    display: flex; flex-direction: column; gap: 2px;
    background: none; border: none; cursor: pointer;
    padding: 5px 8px; border-radius: 4px; text-align: left;
    transition: background 0.12s;
  }
  .alert-item:hover { background: rgba(251,191,36,0.06); }
  .alert-top { display: flex; align-items: center; gap: 4px; }
  .alert-sym { font-family: var(--sc-font-mono); font-size: 12px; font-weight: 600; color: var(--sc-text-0); }
  .alert-tf { font-family: var(--sc-font-mono); font-size: 9px; color: var(--sc-text-2);
    background: rgba(255,255,255,0.06); border-radius: 3px; padding: 1px 4px; }
  .alert-pwin { font-family: var(--sc-font-mono); font-size: 10px; color: var(--sc-text-2); margin-left: auto; }
  .alert-pwin.good { color: var(--sc-good, #adca7c); }
  .alert-time { font-family: var(--sc-font-mono); font-size: 9px; color: var(--sc-text-2); }
  .alert-blocks { font-size: 10px; color: rgba(251,191,36,0.7); margin: 0; line-height: 1.3;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }

  /* Pattern Engine section */
  .pattern-section { background: rgba(173,202,124,0.03); border-bottom: 1px solid rgba(173,202,124,0.1) !important; }
  .section-dot { color: #4ade80; margin-right: 3px; }
  .section-link {
    margin-left: auto; font-size: 9px; color: rgba(255,255,255,0.25);
    text-decoration: none; letter-spacing: 0; font-weight: 400; text-transform: none;
  }
  .section-link:hover { color: rgba(255,255,255,0.5); }
  .section-title { display: flex; align-items: center; }

  .pattern-row { margin-bottom: 8px; }
  .pattern-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .pattern-slug {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 700;
    letter-spacing: 0.06em; color: rgba(173,202,124,0.9);
  }
  .pattern-phase {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 600;
    padding: 1px 5px; border-radius: 2px; letter-spacing: 0.04em;
  }
  .pattern-phase.phase-accumulation { background: rgba(74,222,128,0.1); color: #4ade80; }
  .pattern-phase.phase-fake_dump    { background: rgba(248,113,113,0.1); color: #f87171; }
  .pattern-phase.phase-real_dump    { background: rgba(248,113,113,0.15); color: #f87171; }
  .pattern-phase.phase-breakout     { background: rgba(251,191,36,0.1); color: #fbbf24; }
  .pattern-phase.phase-arch_zone    { background: rgba(99,179,237,0.1); color: #63b3ed; }

  .pattern-syms { display: flex; flex-wrap: wrap; gap: 3px; }
  .sym-chip {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 600;
    color: rgba(247,242,234,0.5); background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 3px;
    padding: 1px 6px; cursor: pointer; transition: all 0.1s;
  }
  .sym-chip:hover { color: var(--sc-text-0); border-color: rgba(173,202,124,0.3); }
  .sym-chip.active { color: #adca7c; border-color: rgba(173,202,124,0.4); background: rgba(173,202,124,0.08); }
  .sym-more { font-size: 9px; color: var(--sc-text-3); padding: 1px 4px; }
</style>
