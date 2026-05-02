<script lang="ts">
  import { setActivePair } from '$lib/stores/activePairStore';
  import { priceStore } from '$lib/stores/priceStore';
  import type { TerminalAnomaly, TerminalPreset } from '$lib/contracts/terminalBackend';
  import { createSymbolSelection, createTerminalSelection, type TerminalSelectionState } from '$lib/terminal/terminalSelectionState';
  import type { MacroCalendarItem, TerminalAlertRule, TerminalWatchlistItem } from '$lib/contracts/terminalPersistence';

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
    watchlistRows?: TerminalWatchlistItem[];
    alerts?: AlertRow[];
    savedAlerts?: TerminalAlertRule[];
    patternPhases?: PatternPhaseRow[];
    activeSymbol?: string;
    macroItems?: MacroCalendarItem[];
    marketEvents?: Array<{ tag?: string; level?: string; text?: string }>;
    queryPresets?: TerminalPreset[];
    anomalies?: TerminalAnomaly[];
    onSelect?: (selection: TerminalSelectionState) => void;
    onQuery?: (q: string) => void;
    onDeleteSavedAlert?: (id: string) => void;
  }
  let {
    trendingData,
    watchlistRows = [],
    alerts = [],
    savedAlerts = [],
    patternPhases = [],
    activeSymbol = '',
    macroItems = [],
    marketEvents = [],
    queryPresets = [],
    anomalies = [],
    onSelect,
    onQuery,
    onDeleteSavedAlert,
  }: Props = $props();

  const QUICK_QUERIES: Array<{ id: string; label: string; action: string; tone: 'info' | 'risk' | 'warn' | 'neutral' }> = [
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
  function signalMark(change: number): string {
    if (change >= 2) return '▲';
    if (change <= -2) return '▼';
    if (Math.abs(change) >= 0.8) return '!';
    return '·';
  }
  function formatCountdown(seconds: number): string {
    if (seconds <= 0) return 'now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  }

  let movers = $derived(trendingData?.trending?.slice(0, 6) ?? []);
  let recentAlerts = $derived(alerts.slice(0, 8));
  let fallbackWatchlist = $derived.by(() => {
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
  let watchlist = $derived.by(() => {
    if (watchlistRows.length > 0) return watchlistRows;
    return fallbackWatchlist.map((coin, index) => ({
      symbol: coin.symbol ?? '',
      timeframe: '4h',
      sortOrder: index,
      active: activeSymbol === coin.symbol || activeSymbol === `${coin.symbol}USDT`,
      preview: {
        price: coin.price ?? null,
        change24h: coin.change24h ?? coin.percentChange24h ?? 0,
        bias: (coin.change24h ?? coin.percentChange24h ?? 0) >= 0 ? 'bullish' : 'bearish',
        confidence: 'medium',
      },
    }));
  });
  let derivedAnomalyItems = $derived.by(() => {
    const items: Array<{ tone: 'warn' | 'bear' | 'info'; label: string; value: string }> = [];
    for (const event of marketEvents.slice(0, 2)) {
      items.push({
        tone: event.level === 'warning' ? 'warn' : event.level === 'critical' ? 'bear' : 'info',
        label: `${event.tag ?? 'EVENT'} ${(event.text ?? 'market event').slice(0, 40)}`,
        value: 'live',
      });
    }
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
  let anomalyItems = $derived.by(() => {
    if (anomalies.length > 0) {
      return anomalies.slice(0, 5).map((item) => ({
        tone: item.severity === 'critical' ? 'bear' : item.severity === 'warning' ? 'warn' : 'info',
        label: item.summary,
        value: item.symbol.replace('USDT', ''),
      }));
    }
    return derivedAnomalyItems;
  });
  function queryCount(id: string): number {
    if (queryPresets.length > 0) {
      const presetMap: Record<string, string> = {
        buy: 'Buy Candidates',
        wrong: "What's Wrong",
        oi: 'High OI',
        breakout: 'Breakout',
        squeeze: 'Liquidation',
      };
      const found = queryPresets.find((preset) => preset.label === presetMap[id]);
      if (found) return found.count;
    }
    if (id === 'buy') return watchlist.filter((coin) => (coin.preview?.change24h ?? 0) > 0).length;
    if (id === 'wrong') return anomalyItems.filter((item) => item.tone === 'bear').length + recentAlerts.filter((alert) => (alert.p_win ?? 0) < 0.5).length;
    if (id === 'oi') return recentAlerts.length;
    if (id === 'breakout') return patternPhases.reduce((sum, row) => sum + row.symbols.length, 0);
    if (id === 'squeeze') return anomalyItems.filter((item) => item.label.toLowerCase().includes('oi')).length;
    return 0;
  }
</script>

<aside class="left-rail">

  <!-- Watchlist — first, most prominent -->
  <section class="rail-section">
    <h3 class="section-title">
      Watchlist
      <span class="alert-count">{watchlist.length}</span>
    </h3>
    <div class="watchlist">
      {#each watchlist as coin}
        {@const base = coin.symbol.replace(/USDT$/,'')}
        {@const chg = coin.preview?.change24h ?? 0}
        {@const isActive = activeSymbol === coin.symbol || activeSymbol === coin.symbol + 'USDT' || coin.active}
        {@const liveEntry = $priceStore[base]}
        {@const displayPrice = liveEntry?.price ?? coin.preview?.price ?? 0}
        {@const liveChg = liveEntry?.change24h ?? chg}
        <button
          class="watch-item"
          class:active={isActive}
          onclick={() => setActivePair(base + '/USDT')}
        >
          <span class="watch-sym">{base}</span>
          <div class="watch-right">
            <span class="watch-price">{formatPrice(displayPrice)}</span>
            <span class="watch-chg" style="color:{pctColor(liveChg)}">{formatPct(liveChg)}</span>
          </div>
        </button>
      {/each}
      {#if watchlist.length === 0}
        <p class="empty-text">Loading watchlist…</p>
      {/if}
    </div>
  </section>

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
              onclick={() => {
                onSelect?.(createSymbolSelection(`${sym}USDT`, '4h', 'pattern_engine', row.slug));
                onQuery?.(`Analyze ${sym}USDT`);
              }}
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
        <button class="query-row" data-tone={q.tone} onclick={() => {
          onSelect?.(createTerminalSelection({
            kind: 'preset',
            timeframe: '4h',
            origin: 'left_presets',
            source: q.label,
            reason: q.action,
          }));
          onQuery?.(q.action);
        }}>
          <span class="query-left">
            <span class="query-dot"></span>
            <span>{q.label}</span>
            {#if queryPresets.length > 0}
              {@const sample = queryPresets.find((preset) => preset.label === q.label)?.sampleSymbols ?? []}
              {#if sample.length > 0}
                <small class="query-sample">{sample.join(' · ')}</small>
              {/if}
            {/if}
          </span>
          <span class="query-count">{queryCount(q.id)}</span>
        </button>
      {/each}
    </div>
  </section>

  <!-- Watchlist -->
  <section class="rail-section">
    <h3 class="section-title">
      Watchlist
      <span class="alert-count">{watchlist.length}</span>
    </h3>
    <div class="watchlist">
      {#if watchlist.length > 0}
        <div class="watch-head">
          <span>SYM</span>
          <span>PRICE</span>
          <span>24H</span>
          <span>SIG</span>
        </div>
      {/if}
      {#each watchlist as coin}
        {@const chg = coin.preview?.change24h ?? 0}
        <button
          class="watch-item"
          class:active={activeSymbol === coin.symbol || activeSymbol === coin.symbol + 'USDT'}
          onclick={() => {
            onSelect?.(createSymbolSelection(`${coin.symbol}USDT`, '4h', 'left_watchlist'));
            setActivePair(coin.symbol + '/USDT');
          }}
        >
          <span class="watch-sym">{coin.symbol}</span>
          <span class="watch-price">{formatPrice(coin.preview?.price ?? 0)}</span>
          <span class="watch-chg" style="color:{pctColor(chg)}">
            {formatPct(chg)}
          </span>
          <span class="watch-sig">{signalMark(chg)}</span>
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
        <button
          class="anomaly-item {item.tone}"
          type="button"
          onclick={() => onSelect?.(createTerminalSelection({
            kind: 'anomaly',
            symbol: item.value ? `${item.value}USDT` : undefined,
            timeframe: '4h',
            origin: 'left_anomalies',
            source: item.label,
            reason: item.value,
          }))}
        >
          <span class="anomaly-label">{item.label}</span>
          <span class="anomaly-value">{item.value}</span>
        </button>
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
      {#if savedAlerts.length > 0}
        {#each savedAlerts.slice(0, 4) as alert}
          <div class="saved-alert-item">
            <button class="alert-item saved" onclick={() => {
              setActivePair(alert.symbol.replace('USDT','') + '/USDT');
              onQuery?.(`Analyze ${alert.symbol} with saved ${alert.kind} rule on ${alert.timeframe}.`);
            }}>
              <div class="alert-top">
                <span class="alert-sym">{alert.symbol.replace('USDT','')}</span>
                <span class="alert-tf">{alert.timeframe}</span>
                <span class="alert-time">saved</span>
              </div>
              <p class="alert-blocks">{alert.kind.replace(/_/g, ' ')} · {String(alert.sourceContext.origin ?? 'terminal')}</p>
            </button>
            <button class="saved-alert-delete" type="button" onclick={() => onDeleteSavedAlert?.(alert.id)}>×</button>
          </div>
        {/each}
      {/if}
      {#each recentAlerts as alert}
        <button class="alert-item" onclick={() => {
          onSelect?.(createTerminalSelection({
            kind: 'alert',
            symbol: alert.symbol,
            timeframe: alert.timeframe,
            origin: 'left_alerts',
            source: 'scanner alert',
            reason: alert.blocks_triggered.slice(0, 2).join(', '),
          }));
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
      <h3 class="section-title">Macro Calendar</h3>
      <div class="macro-list">
        {#each macroItems as item}
          <div class="macro-item">
            <span class="macro-title">{item.title}</span>
            <span class="macro-meta">{item.impact.toUpperCase()} · {formatCountdown(item.countdownSeconds)} · {item.affectedAssets.join(' · ')}</span>
            <small class="macro-summary">{item.summary}</small>
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
        <button class="mover-item" onclick={() => {
          onSelect?.(createSymbolSelection(`${coin.symbol}USDT`, '4h', 'left_watchlist'));
          setActivePair(coin.symbol + '/USDT');
        }}>
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
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
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
    flex-wrap: wrap;
  }

  .query-sample {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(255,255,255,0.26);
    letter-spacing: 0.04em;
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
    font-size: var(--ui-text-xs);
    color: rgba(255,255,255,0.24);
    flex-shrink: 0;
  }

  .watch-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 36px;
    background: none;
    border: 1px solid transparent;
    border-left: 2px solid transparent;
    cursor: pointer;
    padding: 4px 6px 4px 8px;
    border-radius: 2px;
    transition: background 0.12s, border-color 0.12s;
    width: 100%;
    text-align: left;
  }
  .watch-item:hover {
    background: rgba(255,255,255,0.04);
  }
  .watch-item.active {
    background: rgba(75,158,253,0.06);
    border-left-color: var(--tv-blue, #4B9EFD);
  }
  .watch-sym {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    color: var(--sc-text-0);
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }
  .watch-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    min-width: 0;
  }
  .watch-price {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: var(--sc-text-1);
  }
  .watch-chg {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    font-weight: 600;
  }

  .anomaly-item {
    width: 100%;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 3px 4px; border-radius: 2px; background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.04);
    text-align: left;
    cursor: pointer;
  }
  .anomaly-item.warn { background: rgba(251,191,36,0.08); }
  .anomaly-item.bear { background: rgba(248,113,113,0.08); }
  .anomaly-item.info { background: rgba(77,143,245,0.08); }
  .anomaly-label { font-size: var(--ui-text-xs); color: var(--sc-text-1); line-height: 1.22; }
  .anomaly-value { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: var(--sc-text-2); white-space: nowrap; }

  .macro-item {
    display: flex; flex-direction: column; gap: 2px;
    padding: 3px 4px; border-radius: 2px; background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.04);
  }
  .macro-title { font-size: var(--ui-text-xs); color: var(--sc-text-1); line-height: 1.22; }
  .macro-meta { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: var(--sc-text-3); }
  .macro-summary { font-size: var(--ui-text-xs); color: rgba(255,255,255,0.56); line-height: 1.22; }

  .mover-item {
    display: flex; align-items: center; justify-content: space-between;
    background: none; border: 1px solid transparent; cursor: pointer; padding: 3px 4px;
    border-radius: 2px; transition: background 0.12s, border-color 0.12s;
  }
  .mover-item:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.06);
  }
  .mover-sym { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); font-weight: 700; color: var(--sc-text-0); }
  .mover-right { display: flex; flex-direction: column; align-items: flex-end; }
  .mover-price { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: var(--sc-text-2); }
  .mover-chg { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); font-weight: 600; }
  .empty-text { font-size: var(--ui-text-xs); color: var(--sc-text-2); padding: 4px; }

  /* Scanner Alerts */
  .alert-count {
    font-size: var(--ui-text-xs); font-weight: 700; background: rgba(251,191,36,0.2);
    color: #fbbf24; border-radius: 2px; padding: 1px 4px; margin-left: 4px;
  }
  .alert-list { display: flex; flex-direction: column; gap: 1px; }
  .saved-alert-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px;
    align-items: stretch;
  }
  .alert-item {
    display: flex; flex-direction: column; gap: 2px;
    background: rgba(255,255,255,0.015); border: 1px solid transparent; cursor: pointer;
    padding: 3px 4px; border-radius: 2px; text-align: left;
    transition: background 0.12s, border-color 0.12s;
  }
  .alert-item.saved {
    background: rgba(77,143,245,0.05);
    border-color: rgba(77,143,245,0.08);
  }
  .alert-item:hover {
    background: rgba(251,191,36,0.06);
    border-color: rgba(251,191,36,0.12);
  }
  .saved-alert-delete {
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.5);
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    min-width: 20px;
  }
  .alert-top { display: flex; align-items: center; gap: 4px; }
  .alert-sym { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); font-weight: 600; color: var(--sc-text-0); }
  .alert-tf { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: var(--sc-text-2);
    background: rgba(255,255,255,0.06); border-radius: 3px; padding: 1px 4px; }
  .alert-pwin { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: var(--sc-text-2); margin-left: auto; }
  .alert-pwin.good { color: var(--sc-good, #adca7c); }
  .alert-time { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: var(--sc-text-2); }
  .alert-blocks { font-size: var(--ui-text-xs); color: rgba(251,191,36,0.7); margin: 0; line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }

  /* Pattern Engine section */
  .pattern-section { background: rgba(173,202,124,0.03); border-bottom: 1px solid rgba(173,202,124,0.1) !important; }
  .section-dot { color: #4ade80; margin-right: 3px; }
  .section-link {
    margin-left: auto; font-size: var(--ui-text-xs); color: rgba(255,255,255,0.25);
    text-decoration: none; letter-spacing: 0; font-weight: 400; text-transform: none;
  }
  .section-link:hover { color: rgba(255,255,255,0.5); }
  .section-title { display: flex; align-items: center; }

  .pattern-row { margin-bottom: 4px; }
  .pattern-top { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
  .pattern-slug {
    font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); font-weight: 700;
    letter-spacing: 0.06em; color: rgba(173,202,124,0.9);
  }
  .pattern-phase {
    font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); font-weight: 600;
    padding: 1px 5px; border-radius: 2px; letter-spacing: 0.04em;
  }
  .pattern-phase.phase-accumulation { background: rgba(74,222,128,0.1); color: #4ade80; }
  .pattern-phase.phase-fake_dump    { background: rgba(248,113,113,0.1); color: #f87171; }
  .pattern-phase.phase-real_dump    { background: rgba(248,113,113,0.15); color: #f87171; }
  .pattern-phase.phase-breakout     { background: rgba(251,191,36,0.1); color: #fbbf24; }
  .pattern-phase.phase-arch_zone    { background: rgba(99,179,237,0.1); color: #63b3ed; }

  .pattern-syms { display: flex; flex-wrap: wrap; gap: 2px; }
  .sym-chip {
    font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); font-weight: 600;
    color: rgba(247,242,234,0.5); background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 3px;
    padding: 1px 4px; cursor: pointer; transition: all 0.1s;
  }
  .sym-chip:hover { color: var(--sc-text-0); border-color: rgba(173,202,124,0.3); }
  .sym-chip.active { color: #adca7c; border-color: rgba(173,202,124,0.4); background: rgba(173,202,124,0.08); }
  .sym-more { font-size: var(--ui-text-xs); color: var(--sc-text-3); padding: 1px 4px; }
</style>
