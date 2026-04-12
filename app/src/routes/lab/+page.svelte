<script lang="ts">
  import { MARKET_CYCLES } from '$lib/data/cycles';
  import {
    strategyStore,
    activeStrategy,
    allStrategies,
    createStrategy,
    createFromPreset,
    setActiveStrategy,
    addCondition,
    removeCondition,
    toggleCondition,
    updateCondition,
    updateExit,
    updateRisk,
    updateDirection,
    updateSelectedCycles,
    saveResult,
    PRESET_STRATEGIES,
  } from '$lib/stores/strategyStore';
  import type { ConditionBlock, ExitConfig, RiskConfig, BacktestResult, Strategy, TradeRecord } from '$lib/engine/backtestEngine';
  import { runMultiCycleBacktest } from '$lib/engine/backtestEngine';
  import type { BinanceKline } from '$lib/engine/types';
  import LabChart from '../../components/lab/LabChart.svelte';
  import type { ChartMarker, PriceLine } from '../../components/lab/LabChart.svelte';
  import LabToolbar from '../../components/lab/LabToolbar.svelte';
  import PositionBar from '../../components/lab/PositionBar.svelte';
  import StrategyBuilder from '../../components/lab/StrategyBuilder.svelte';
  import ResultPanel from '../../components/lab/ResultPanel.svelte';

  // ─── Core State ─────────────────────────────────────────

  let mode = $state<'auto' | 'manual'>('auto');
  let activeTab = $state<'strategy' | 'result' | 'order' | 'trades'>('strategy');
  let interval = $state('4h');
  let isRunning = $state(false);
  let error = $state<string | null>(null);

  // Chart data
  let klines = $state<BinanceKline[]>([]);
  let chartMarkers = $state<ChartMarker[]>([]);
  let chartPriceLines = $state<PriceLine[]>([]);
  let revealedBars = $state(0);

  // Auto mode
  let backtestResult = $state<BacktestResult | null>(null);
  let selectedTradeIndex = $state(-1);

  // Manual mode
  let manualPosition = $state<{ direction: string; entryPrice: number; currentPrice: number; pnlPercent: number; slPrice: number; tpPrice: number } | null>(null);

  // Store derived
  const entry = $derived($activeStrategy);
  const strat = $derived(entry?.strategy ?? null);
  const selectedCycles = $derived(entry?.selectedCycles ?? ['2020-covid', '2021-bull', '2022-bear', '2023-recovery']);
  const strategies = $derived($allStrategies);
  const testedChallengeCount = $derived(strategies.filter((item) => item.lastResult).length);
  const pendingChallengeCount = $derived(Math.max(strategies.length - testedChallengeCount, 0));
  const activeChallengeLabel = $derived(strat?.name ?? 'No challenge selected');

  // Init
  $effect(() => {
    const store = $strategyStore;
    if (Object.keys(store.entries).length === 0) {
      createFromPreset(PRESET_STRATEGIES[0]);
    }
  });

  $effect(() => {
    if (entry?.lastResult) {
      backtestResult = entry.lastResult;
      buildMarkersFromResult(entry.lastResult);
    } else {
      backtestResult = null;
      chartMarkers = [];
      chartPriceLines = [];
    }
  });

  // ─── Auto Mode: Backtest ────────────────────────────────

  async function runBacktest() {
    if (!strat || selectedCycles.length === 0) return;
    isRunning = true;
    error = null;
    backtestResult = null;
    chartMarkers = [];
    chartPriceLines = [];
    activeTab = 'result';

    try {
      const cycleKlines: Array<{ cycleId: string; klines: BinanceKline[] }> = [];
      const allKlines: BinanceKline[] = [];

      for (const cycleId of selectedCycles) {
        const res = await fetch(`/api/cycles/klines?cycleId=${cycleId}&interval=${interval}`);
        if (!res.ok) throw new Error(`Failed to fetch ${cycleId}`);
        const data = await res.json();
        cycleKlines.push({ cycleId, klines: data.klines });
        allKlines.push(...data.klines);
      }

      // Sort all klines by time for chart
      allKlines.sort((a: BinanceKline, b: BinanceKline) => a.time - b.time);
      klines = allKlines;
      revealedBars = allKlines.length; // auto mode: show all

      const btResult = runMultiCycleBacktest(strat, cycleKlines, { interval });
      backtestResult = btResult;
      saveResult(strat.id, btResult);

      buildMarkersFromResult(btResult);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      isRunning = false;
    }
  }

  function buildMarkersFromResult(result: BacktestResult) {
    const marks: ChartMarker[] = [];
    for (const t of result.trades) {
      // Entry marker
      marks.push({
        time: t.entryTime,
        position: t.direction === 'long' ? 'belowBar' : 'aboveBar',
        color: t.direction === 'long' ? '#adca7c' : '#cf7f8f',
        shape: t.direction === 'long' ? 'arrowUp' : 'arrowDown',
        text: t.direction === 'long' ? 'L' : 'S',
      });
      // Exit marker
      marks.push({
        time: t.exitTime,
        position: t.netPnlPercent >= 0 ? 'aboveBar' : 'belowBar',
        color: t.netPnlPercent >= 0 ? '#adca7c' : '#cf7f8f',
        shape: 'circle',
        text: `${t.netPnlPercent >= 0 ? '+' : ''}${t.netPnlPercent.toFixed(1)}%`,
      });
    }
    chartMarkers = marks;
  }

  function selectTrade(idx: number) {
    if (!backtestResult || idx < 0 || idx >= backtestResult.trades.length) return;
    selectedTradeIndex = idx;
    const trade = backtestResult.trades[idx];

    // Show SL/TP lines for this trade
    chartPriceLines = [
      { price: trade.slPrice, color: '#cf7f8f', lineWidth: 1, lineStyle: 2, title: `SL ${trade.slPrice.toFixed(0)}` },
      { price: trade.tpPrice, color: '#adca7c', lineWidth: 1, lineStyle: 2, title: `TP ${trade.tpPrice.toFixed(0)}` },
      { price: trade.entryPrice, color: '#f2d193', lineWidth: 1, lineStyle: 1, title: `Entry ${trade.entryPrice.toFixed(0)}` },
    ];
  }

  // ─── Manual Mode ────────────────────────────────────────

  async function loadCycleForManual() {
    if (selectedCycles.length === 0) return;
    const cycleId = selectedCycles[0]; // Use first selected cycle
    try {
      const res = await fetch(`/api/cycles/klines?cycleId=${cycleId}&interval=${interval}`);
      if (!res.ok) return;
      const data = await res.json();
      klines = data.klines;
      revealedBars = Math.min(50, data.klines.length); // Show 50 bars context
      chartMarkers = [];
      chartPriceLines = [];
      manualPosition = null;
    } catch {}
  }

  function nextBar() {
    if (revealedBars < klines.length) {
      revealedBars++;
      // Check if position needs to be updated
      if (manualPosition && revealedBars > 0) {
        const currentBar = klines[revealedBars - 1];
        manualPosition = {
          ...manualPosition,
          currentPrice: currentBar.close,
          pnlPercent: manualPosition.direction === 'long'
            ? ((currentBar.close - manualPosition.entryPrice) / manualPosition.entryPrice) * 100
            : ((manualPosition.entryPrice - currentBar.close) / manualPosition.entryPrice) * 100,
        };
      }
    }
  }

  function toggleMode() {
    mode = mode === 'auto' ? 'manual' : 'auto';
    if (mode === 'manual') {
      activeTab = 'order';
      loadCycleForManual();
    } else {
      activeTab = 'strategy';
    }
  }

  // ─── Handlers ───────────────────────────────────────────

  function handleAddCondition(cond: ConditionBlock) { if (strat) addCondition(strat.id, cond); }
  function handleRemoveCondition(i: number) { if (strat) removeCondition(strat.id, i); }
  function handleToggleCondition(i: number) { if (strat) toggleCondition(strat.id, i); }
  function handleUpdateCondition(i: number, u: Partial<ConditionBlock>) { if (strat) updateCondition(strat.id, i, u); }
  function handleUpdateExit(u: Partial<ExitConfig>) { if (strat) updateExit(strat.id, u); }
  function handleUpdateRisk(u: Partial<RiskConfig>) { if (strat) updateRisk(strat.id, u); }
  function handleUpdateDirection(d: Strategy['direction']) { if (strat) updateDirection(strat.id, d); }
  function handleCycleChange(ids: string[]) { if (strat) updateSelectedCycles(strat.id, ids); }
  function handleSave() { if (strat && backtestResult) saveResult(strat.id, backtestResult); }
  function handleViewChart() { if (backtestResult && backtestResult.trades.length > 0) selectTrade(0); }
  function handleNewStrategy() { createStrategy('New Strategy'); }
  function handleImport() { /* TODO: open import sheet */ }
  function handleClosePosition() { manualPosition = null; chartPriceLines = []; }
</script>

<svelte:head>
  <title>Lab — Cogochi</title>
</svelte:head>

<div class="lab-page">
  <section class="lab-intro">
    <div class="lab-intro-copy">
      <span class="lab-kicker">LAB</span>
      <h1>Evaluate saved challenges.</h1>
      <p>
        Terminal is where a pattern gets captured. Lab is where it gets rerun, inspected, and judged against real market history.
      </p>
    </div>
    <div class="lab-summary">
      <article class="lab-stat">
        <span class="lab-stat-label">Selected</span>
        <strong>{activeChallengeLabel}</strong>
      </article>
      <article class="lab-stat">
        <span class="lab-stat-label">Tested</span>
        <strong>{testedChallengeCount}</strong>
      </article>
      <article class="lab-stat">
        <span class="lab-stat-label">Waiting</span>
        <strong>{pendingChallengeCount}</strong>
      </article>
    </div>
  </section>

  <!-- Toolbar -->
  <LabToolbar
    {strategies}
    activeStrategy={strat}
    {selectedCycles}
    {mode}
    {interval}
    {isRunning}
    onSelectStrategy={setActiveStrategy}
    onSelectCycles={handleCycleChange}
    onToggleMode={toggleMode}
    onChangeInterval={(v) => { interval = v; }}
    onRun={runBacktest}
    onNextBar={nextBar}
    onNewStrategy={handleNewStrategy}
    onImport={handleImport}
  />

  <!-- Main: Chart + Panel -->
  <div class="lab-main">
    <div class="chart-area">
      <LabChart
        {klines}
        revealedCount={revealedBars}
        markers={chartMarkers}
        priceLines={chartPriceLines}
        {mode}
      />
    </div>

    <div class="panel-area">
      <!-- Tab bar -->
      <div class="tab-bar">
        {#if mode === 'auto'}
          <button class="tab" class:active={activeTab === 'strategy'} onclick={() => activeTab = 'strategy'}>챌린지</button>
          <button class="tab" class:active={activeTab === 'result'} onclick={() => activeTab = 'result'}>런 결과</button>
        {:else}
          <button class="tab" class:active={activeTab === 'order'} onclick={() => activeTab = 'order'}>리플레이</button>
          <button class="tab" class:active={activeTab === 'trades'} onclick={() => activeTab = 'trades'}>로그</button>
        {/if}
      </div>

      <!-- Tab content -->
      <div class="tab-content">
        {#if activeTab === 'strategy' && strat}
          <StrategyBuilder
            strategy={strat}
            onAddCondition={handleAddCondition}
            onRemoveCondition={handleRemoveCondition}
            onToggleCondition={handleToggleCondition}
            onUpdateCondition={handleUpdateCondition}
            onUpdateExit={handleUpdateExit}
            onUpdateRisk={handleUpdateRisk}
            onUpdateDirection={handleUpdateDirection}
          />
        {:else if activeTab === 'result'}
          <ResultPanel
            result={backtestResult}
            {isRunning}
            onSave={handleSave}
            onViewChart={handleViewChart}
          />
        {:else if activeTab === 'order'}
          <!-- Manual mode: simple order buttons -->
          <div class="manual-order">
            <div class="order-section">
              <div class="order-label">Quick Order</div>
              <div class="order-buttons">
                <button class="order-btn long" disabled={!!manualPosition}
                  onclick={() => {
                    if (klines.length > 0 && revealedBars > 0) {
                      const price = klines[revealedBars - 1].close;
                      const sl = price * 0.985;
                      const tp = price * 1.03;
                      manualPosition = { direction: 'long', entryPrice: price, currentPrice: price, pnlPercent: 0, slPrice: sl, tpPrice: tp };
                      chartPriceLines = [
                        { price: sl, color: '#cf7f8f', lineWidth: 1, lineStyle: 2, title: 'SL' },
                        { price: tp, color: '#adca7c', lineWidth: 1, lineStyle: 2, title: 'TP' },
                        { price, color: '#f2d193', lineWidth: 1, lineStyle: 1, title: 'Entry' },
                      ];
                      chartMarkers = [...chartMarkers, {
                        time: klines[revealedBars - 1].time,
                        position: 'belowBar', color: '#adca7c', shape: 'arrowUp', text: 'L',
                      }];
                    }
                  }}>LONG</button>
                <button class="order-btn short" disabled={!!manualPosition}
                  onclick={() => {
                    if (klines.length > 0 && revealedBars > 0) {
                      const price = klines[revealedBars - 1].close;
                      const sl = price * 1.015;
                      const tp = price * 0.97;
                      manualPosition = { direction: 'short', entryPrice: price, currentPrice: price, pnlPercent: 0, slPrice: sl, tpPrice: tp };
                      chartPriceLines = [
                        { price: sl, color: '#cf7f8f', lineWidth: 1, lineStyle: 2, title: 'SL' },
                        { price: tp, color: '#adca7c', lineWidth: 1, lineStyle: 2, title: 'TP' },
                        { price, color: '#f2d193', lineWidth: 1, lineStyle: 1, title: 'Entry' },
                      ];
                      chartMarkers = [...chartMarkers, {
                        time: klines[revealedBars - 1].time,
                        position: 'aboveBar', color: '#cf7f8f', shape: 'arrowDown', text: 'S',
                      }];
                    }
                  }}>SHORT</button>
              </div>
            </div>
            {#if manualPosition}
              <div class="pos-info">
                <div class="pos-row">
                  <span class="pos-label">방향</span>
                  <span class="pos-val" class:long={manualPosition.direction === 'long'} class:short={manualPosition.direction === 'short'}>
                    {manualPosition.direction.toUpperCase()}
                  </span>
                </div>
                <div class="pos-row">
                  <span class="pos-label">진입가</span>
                  <span class="pos-val">{manualPosition.entryPrice.toFixed(0)}</span>
                </div>
                <div class="pos-row">
                  <span class="pos-label">현재가</span>
                  <span class="pos-val">{manualPosition.currentPrice.toFixed(0)}</span>
                </div>
                <div class="pos-row">
                  <span class="pos-label">미실현</span>
                  <span class="pos-val {manualPosition.pnlPercent >= 0 ? 'positive' : 'negative'}">
                    {manualPosition.pnlPercent >= 0 ? '+' : ''}{manualPosition.pnlPercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            {/if}
          </div>
        {:else if activeTab === 'trades'}
          <div class="trades-empty">수동 트레이드 내역</div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Position Bar -->
  <PositionBar
    {mode}
    {backtestResult}
    {selectedTradeIndex}
    onPrevTrade={() => selectTrade(Math.max(0, selectedTradeIndex - 1))}
    onNextTrade={() => selectTrade(Math.min((backtestResult?.totalTrades ?? 1) - 1, selectedTradeIndex + 1))}
    position={manualPosition}
    {revealedBars}
    totalBars={klines.length}
    onClose={handleClosePosition}
  />

  {#if error}
    <div class="error-bar">{error}</div>
  {/if}
</div>

<style>
  .lab-page {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    height: calc(100vh - 60px);
    max-height: calc(100vh - 60px);
    overflow: hidden;
  }

  .lab-intro {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    padding: 16px 18px;
    border-radius: 12px;
    border: 1px solid rgba(255 255 255 / 0.08);
    background:
      radial-gradient(circle at top left, rgba(219 154 159 / 0.12), transparent 32%),
      linear-gradient(180deg, rgba(20 25 36 / 0.96), rgba(12 16 24 / 0.96));
  }

  .lab-intro-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 620px;
  }

  .lab-kicker {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--lis-accent);
  }

  .lab-intro-copy h1 {
    margin: 0;
    font-family: var(--sc-font-display);
    font-size: clamp(24px, 3vw, 34px);
    line-height: 1;
    color: rgba(255 255 255 / 0.95);
  }

  .lab-intro-copy p {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255 255 255 / 0.62);
  }

  .lab-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(120px, 1fr));
    gap: 10px;
    min-width: min(100%, 420px);
  }

  .lab-stat {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px;
    border-radius: 10px;
    background: rgba(255 255 255 / 0.03);
    border: 1px solid rgba(255 255 255 / 0.06);
  }

  .lab-stat-label {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: rgba(255 255 255 / 0.42);
    text-transform: uppercase;
  }

  .lab-stat strong {
    font-size: 15px;
    line-height: 1.3;
    color: rgba(255 255 255 / 0.92);
  }

  /* ── Main (chart + panel) ── */
  .lab-main {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 8px;
    flex: 1;
    min-height: 0;
  }

  .chart-area {
    min-height: 0;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--lis-border-soft);
  }

  .panel-area {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 8px;
    overflow: hidden;
  }

  /* ── Tab bar ── */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid rgba(255 255 255 / 0.06);
    flex-shrink: 0;
  }

  .tab {
    flex: 1;
    padding: 10px 0;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-family: var(--sc-font-body);
    font-size: 12px;
    color: rgba(255 255 255 / 0.4);
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover { color: rgba(255 255 255 / 0.6); }
  .tab.active {
    color: var(--lis-accent);
    border-bottom-color: var(--lis-accent);
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
  }

  .tab-content::-webkit-scrollbar { width: 3px; }
  .tab-content::-webkit-scrollbar-thumb { background: rgba(var(--lis-rgb-pink), 0.15); border-radius: 2px; }

  /* ── Manual order ── */
  .manual-order {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .order-label {
    font-family: var(--sc-font-body);
    font-size: 11px;
    color: rgba(255 255 255 / 0.35);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 8px;
  }

  .order-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .order-btn {
    padding: 14px;
    border-radius: 6px;
    font-family: var(--sc-font-mono);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid;
  }

  .order-btn.long {
    background: rgba(173, 202, 124, 0.12);
    border-color: rgba(173, 202, 124, 0.3);
    color: var(--lis-positive);
  }
  .order-btn.long:hover:not(:disabled) {
    background: rgba(173, 202, 124, 0.22);
    box-shadow: var(--lis-glow-lime);
  }

  .order-btn.short {
    background: rgba(207, 127, 143, 0.12);
    border-color: rgba(207, 127, 143, 0.3);
    color: var(--sc-bad);
  }
  .order-btn.short:hover:not(:disabled) {
    background: rgba(207, 127, 143, 0.22);
    box-shadow: var(--lis-glow-pink);
  }

  .order-btn:disabled { opacity: 0.25; cursor: not-allowed; }

  .pos-info {
    background: var(--lis-bg-0);
    border: 1px solid rgba(255 255 255 / 0.06);
    border-radius: 6px;
    padding: 10px;
  }

  .pos-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }

  .pos-label { font-size: 11px; color: rgba(255 255 255 / 0.35); }
  .pos-val { font-family: var(--sc-font-mono); font-size: 12px; color: rgba(255 255 255 / 0.8); }
  .pos-val.long { color: var(--lis-positive); }
  .pos-val.short { color: var(--sc-bad); }
  .pos-val.positive { color: var(--lis-positive); }
  .pos-val.negative { color: var(--sc-bad); }

  .trades-empty {
    text-align: center;
    padding: 40px 0;
    color: rgba(255 255 255 / 0.2);
    font-size: 12px;
  }

  /* ── Error ── */
  .error-bar {
    padding: 8px 14px;
    background: rgba(var(--lis-rgb-pink), 0.08);
    border: 1px solid rgba(var(--lis-rgb-pink), 0.2);
    border-radius: 6px;
    font-size: 12px;
    color: var(--sc-bad);
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .lab-page { padding: 6px; height: auto; max-height: none; }
    .lab-intro { flex-direction: column; }
    .lab-summary { grid-template-columns: 1fr; min-width: 0; }
    .lab-main { grid-template-columns: 1fr; }
    .chart-area { height: 50vh; }
    .panel-area { max-height: 40vh; }
  }
</style>
