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
    newsItems?: Array<{ title?: string; source?: string; created_at?: string; published_at?: string }>;
    onQuery?: (q: string) => void;
  }
  let { trendingData, alerts = [], patternPhases = [], activeSymbol = '', newsItems = [], onQuery }: Props = $props();

  const QUICK_QUERIES = [
    { id: 'buy',      label: 'Buy Candidates', action: 'Show me the best buy candidates right now', tone: 'info' },
    { id: 'wrong',    label: "What's Wrong",   action: 'What assets have warning signals right now?', tone: 'risk' },
    { id: 'oi',       label: 'High OI',        action: 'Show assets with the highest open interest expansion', tone: 'warn' },
    { id: 'breakout', label: 'Breakout Watch', action: 'Which assets are near breakout conditions?', tone: 'neutral' },
    { id: 'squeeze',  label: 'Short Squeeze',  action: 'Show assets with short squeeze potential', tone: 'neutral' },
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
  let watchlist = $derived.by(() => {
    const ordered = [
      ...(trendingData?.trending ?? []),
      ...(trendingData?.gainers ?? []),
      ...(trendingData?.losers ?? []),
    ];
    const seen = new Set<string>();
    return ordered
      .filter((coin) => {
        const symbol = coin.symbol ?? '';
        if (!symbol || seen.has(symbol)) return false;
        seen.add(symbol);
        return true;
      })
      .slice(0, 6);
  });
  let anomalyItems = $derived.by(() => {
    const items: Array<{ tone: 'warn' | 'bear' | 'info'; label: string; value: string }> = [];
    for (const alert of recentAlerts.slice(0, 3)) {
      items.push({
        tone: alert.p_win != null && alert.p_win >= 0.58 ? 'warn' : 'info',
        label: `${alert.symbol.replace('USDT', '')} ${blockLabel(alert.blocks_triggered[0] ?? 'signal')}`,
        value: alert.p_win != null ? `${(alert.p_win * 100).toFixed(0)}%` : relativeTime(alert.created_at),
      });
    }
    for (const coin of (trendingData?.losers ?? []).slice(0, 2)) {
      items.push({
        tone: 'bear',
        label: `${coin.symbol} pressure`,
        value: formatPct(coin.percentChange24h ?? coin.change24h ?? 0),
      });
    }
    return items.slice(0, 5);
  });
  let macroItems = $derived(newsItems.slice(0, 2));
  function queryCount(id: string): number {
    if (id === 'buy') return watchlist.filter((coin) => (coin.change24h ?? coin.percentChange24h ?? 0) > 0).length;
    if (id === 'wrong') return anomalyItems.filter((item) => item.tone === 'bear').length + recentAlerts.filter((alert) => (alert.p_win ?? 0) < 0.5).length;
    if (id === 'oi') return recentAlerts.length;
    if (id === 'breakout') return patternPhases.reduce((sum, row) => sum + row.symbols.length, 0);
    if (id === 'squeeze') return anomalyItems.filter((item) => item.label.toLowerCase().includes('oi')).length;
    return 0;
  }
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
    <div class="query-list">
      {#each QUICK_QUERIES as q}
        <button class="query-row" data-tone={q.tone} onclick={() => onQuery?.(q.action)}>
          <span class="query-left">
            <span class="query-dot"></span>
            <span>{q.label}</span>
          </span>
          <span class="query-count">{queryCount(q.id)}</span>
        </button>
      {/each}
    </div>
  </section>

  <!-- Watchlist -->
  <section class="rail-section">
    <h3 class="section-title">Watchlist</h3>
    <div class="watchlist">
      {#if watchlist.length > 0}
        <div class="watch-head">
          <span>SYM</span>
          <span>PRICE</span>
          <span>24H</span>
        </div>
      {/if}
      {#each watchlist as coin}
        <button
          class="watch-item"
          class:active={activeSymbol === coin.symbol || activeSymbol === coin.symbol + 'USDT'}
          onclick={() => setActivePair(coin.symbol + '/USDT')}
        >
          <span class="watch-sym">{coin.symbol}</span>
          <span class="watch-price">{formatPrice(coin.price ?? 0)}</span>
          <span class="watch-chg" style="color:{pctColor(coin.change24h ?? coin.percentChange24h ?? 0)}">
            {formatPct(coin.change24h ?? coin.percentChange24h ?? 0)}
          </span>
        </button>
      {/each}
      {#if watchlist.length === 0}
        <p class="empty-text">Loading watchlist…</p>
      {/if}
    </div>
  </section>

  <!-- Anomalies -->
  <section class="rail-section">
    <h3 class="section-title">Anomalies</h3>
    <div class="anomaly-list">
      {#each anomalyItems as item}
        <div class="anomaly-item {item.tone}">
          <span class="anomaly-label">{item.label}</span>
          <span class="anomaly-value">{item.value}</span>
        </div>
      {/each}
      {#if anomalyItems.length === 0}
        <p class="empty-text">No unusual flows detected</p>
      {/if}
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

  <!-- Macro / News -->
  {#if macroItems.length > 0}
    <section class="rail-section">
      <h3 class="section-title">Macro / News</h3>
      <div class="macro-list">
        {#each macroItems as item}
          <div class="macro-item">
            <span class="macro-title">{item.title ?? 'Headline'}</span>
            <span class="macro-meta">{item.source ?? 'News'} · {relativeTime(item.created_at ?? item.published_at ?? new Date().toISOString())}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Movers -->
  {#if movers.length > 0}
    <section class="rail-section">
      <h3 class="section-title">Momentum</h3>
      {#each movers.slice(0, 4) as coin}
        <button class="mover-item" onclick={() => setActivePair(coin.symbol + '/USDT')}>
          <span class="mover-sym">{coin.symbol}</span>
          <div class="mover-right">
            <span class="mover-price">{formatPrice(coin.price ?? 0)}</span>
            <span class="mover-chg" style="color:{pctColor(coin.change24h ?? 0)}">{formatPct(coin.change24h ?? 0)}</span>
          </div>
        </button>
      {/each}
    </section>
  {/if}
</aside>

<style>
  .left-rail {
    background: #0b0e14;
    border-right: 1px solid rgba(255,255,255,0.07);
    overflow-y: auto; padding: 3px 0;
    display: flex; flex-direction: column; gap: 0;
  }
  .rail-section {
    padding: 4px 5px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .section-title {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.24);
    margin: 0 0 3px;
  }

  .query-list,
  .watchlist,
  .anomaly-list,
  .macro-list,
  .mover-list { display: flex; flex-direction: column; gap: 1px; }

  .query-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 9px;
    color: rgba(200,208,220,0.72);
    padding: 3px 4px;
    border-radius: 2px;
    transition: all 0.12s;
  }

  .query-row:hover {
    background: rgba(255,255,255,0.035);
    color: var(--sc-text-0);
    border-color: rgba(255,255,255,0.06);
  }

  .query-row[data-tone='info'] { color: rgba(120,184,255,0.86); }
  .query-row[data-tone='warn'] { color: rgba(233,193,103,0.86); }
  .query-row[data-tone='risk'] { color: rgba(241,153,153,0.86); }

  .query-left {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .query-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.55;
    flex-shrink: 0;
  }

  .query-count {
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: rgba(255,255,255,0.24);
    flex-shrink: 0;
  }

  .watch-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52px 38px;
    gap: 4px;
    padding: 1px 4px 2px;
    border-bottom: 1px solid rgba(255,255,255,0.045);
  }

  .watch-head span {
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: rgba(255,255,255,0.18);
    letter-spacing: 0.08em;
  }

  .watch-head span:nth-child(2),
  .watch-head span:nth-child(3) {
    text-align: right;
  }

  .watch-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52px 38px;
    align-items: center;
    gap: 4px;
    background: none; border: 1px solid transparent; cursor: pointer; padding: 2px 4px;
    border-radius: 2px; transition: background 0.12s, border-color 0.12s;
  }
  .watch-item:hover, .watch-item.active {
    background: rgba(77,143,245,0.08);
    border-color: rgba(77,143,245,0.12);
  }
  .watch-sym { font-family: var(--sc-font-mono); font-size: 9px; font-weight: 700; color: var(--sc-text-0); letter-spacing: 0.02em; }
  .watch-price, .watch-chg { font-family: var(--sc-font-mono); font-size: 8px; text-align: right; }

  .anomaly-item {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 3px 4px; border-radius: 2px; background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.04);
  }
  .anomaly-item.warn { background: rgba(251,191,36,0.08); }
  .anomaly-item.bear { background: rgba(248,113,113,0.08); }
  .anomaly-item.info { background: rgba(77,143,245,0.08); }
  .anomaly-label { font-size: 9px; color: var(--sc-text-1); line-height: 1.22; }
  .anomaly-value { font-family: var(--sc-font-mono); font-size: 8px; color: var(--sc-text-2); white-space: nowrap; }

  .macro-item {
    display: flex; flex-direction: column; gap: 2px;
    padding: 3px 4px; border-radius: 2px; background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.04);
  }
  .macro-title { font-size: 8px; color: var(--sc-text-1); line-height: 1.22; }
  .macro-meta { font-family: var(--sc-font-mono); font-size: 7px; color: var(--sc-text-3); }

  .mover-item {
    display: flex; align-items: center; justify-content: space-between;
    background: none; border: 1px solid transparent; cursor: pointer; padding: 3px 4px;
    border-radius: 2px; transition: background 0.12s, border-color 0.12s;
  }
  .mover-item:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.06);
  }
  .mover-sym { font-family: var(--sc-font-mono); font-size: 9px; font-weight: 700; color: var(--sc-text-0); }
  .mover-right { display: flex; flex-direction: column; align-items: flex-end; }
  .mover-price { font-family: var(--sc-font-mono); font-size: 8px; color: var(--sc-text-2); }
  .mover-chg { font-family: var(--sc-font-mono); font-size: 9px; font-weight: 600; }
  .empty-text { font-size: 10px; color: var(--sc-text-2); padding: 4px; }

  /* Scanner Alerts */
  .alert-count {
    font-size: 8px; font-weight: 700; background: rgba(251,191,36,0.2);
    color: #fbbf24; border-radius: 2px; padding: 1px 4px; margin-left: 4px;
  }
  .alert-list { display: flex; flex-direction: column; gap: 1px; }
  .alert-item {
    display: flex; flex-direction: column; gap: 2px;
    background: rgba(255,255,255,0.015); border: 1px solid transparent; cursor: pointer;
    padding: 3px 4px; border-radius: 2px; text-align: left;
    transition: background 0.12s, border-color 0.12s;
  }
  .alert-item:hover {
    background: rgba(251,191,36,0.06);
    border-color: rgba(251,191,36,0.12);
  }
  .alert-top { display: flex; align-items: center; gap: 4px; }
  .alert-sym { font-family: var(--sc-font-mono); font-size: 10px; font-weight: 600; color: var(--sc-text-0); }
  .alert-tf { font-family: var(--sc-font-mono); font-size: 8px; color: var(--sc-text-2);
    background: rgba(255,255,255,0.06); border-radius: 3px; padding: 1px 4px; }
  .alert-pwin { font-family: var(--sc-font-mono); font-size: 8px; color: var(--sc-text-2); margin-left: auto; }
  .alert-pwin.good { color: var(--sc-good, #adca7c); }
  .alert-time { font-family: var(--sc-font-mono); font-size: 8px; color: var(--sc-text-2); }
  .alert-blocks { font-size: 8px; color: rgba(251,191,36,0.7); margin: 0; line-height: 1.2;
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

  .pattern-row { margin-bottom: 4px; }
  .pattern-top { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
  .pattern-slug {
    font-family: var(--sc-font-mono); font-size: 8px; font-weight: 700;
    letter-spacing: 0.06em; color: rgba(173,202,124,0.9);
  }
  .pattern-phase {
    font-family: var(--sc-font-mono); font-size: 8px; font-weight: 600;
    padding: 1px 5px; border-radius: 2px; letter-spacing: 0.04em;
  }
  .pattern-phase.phase-accumulation { background: rgba(74,222,128,0.1); color: #4ade80; }
  .pattern-phase.phase-fake_dump    { background: rgba(248,113,113,0.1); color: #f87171; }
  .pattern-phase.phase-real_dump    { background: rgba(248,113,113,0.15); color: #f87171; }
  .pattern-phase.phase-breakout     { background: rgba(251,191,36,0.1); color: #fbbf24; }
  .pattern-phase.phase-arch_zone    { background: rgba(99,179,237,0.1); color: #63b3ed; }

  .pattern-syms { display: flex; flex-wrap: wrap; gap: 2px; }
  .sym-chip {
    font-family: var(--sc-font-mono); font-size: 8px; font-weight: 600;
    color: rgba(247,242,234,0.5); background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 3px;
    padding: 1px 4px; cursor: pointer; transition: all 0.1s;
  }
  .sym-chip:hover { color: var(--sc-text-0); border-color: rgba(173,202,124,0.3); }
  .sym-chip.active { color: #adca7c; border-color: rgba(173,202,124,0.4); background: rgba(173,202,124,0.08); }
  .sym-more { font-size: 9px; color: var(--sc-text-3); padding: 1px 4px; }
</style>
