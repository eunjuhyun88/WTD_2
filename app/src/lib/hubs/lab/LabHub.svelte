<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { buildCanonicalHref } from '$lib/seo/site';
  import PageCover from '../../../components/shared/PageCover.svelte';
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
  import { fetchPatternCaptureById } from '$lib/api/terminalPersistence';
  import { buildLabDraftFromCapture } from '$lib/lab/captureDraft';
  import type {
    ConditionBlock,
    ExitConfig,
    RiskConfig,
    BacktestResult,
    Strategy
  } from '$lib/lab/backtest';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import { runMultiCycleBacktest } from '$lib/lab/backtest';
  import type { BinanceKline } from '$lib/contracts/marketContext';
  import LabChart from '../../../components/lab/LabChart.svelte';
  import type { ChartMarker, PriceLine } from '../../../components/lab/LabChart.svelte';
  import LabToolbar from '../../../components/lab/LabToolbar.svelte';
  import PositionBar from '../../../components/lab/PositionBar.svelte';
  import StrategyBuilder from '../../../components/lab/StrategyBuilder.svelte';
  import ResultPanel from '../../../components/lab/ResultPanel.svelte';
  import RefinementPanel from '../../../components/lab/RefinementPanel.svelte';
  import PatternRunPanel from '../../../components/lab/PatternRunPanel.svelte';
  import BacktestSummaryStrip from '../../../components/lab/BacktestSummaryStrip.svelte';
  import EquityCurveChart from '../../../components/lab/EquityCurveChart.svelte';
  import TradeLogTable from '../../../components/lab/TradeLogTable.svelte';
  import { buildEquitySeries } from '$lib/lab/equityCurve';
  import type { EquitySeries } from '$lib/lab/equityCurve';
  import LabHoldTimeAdapter from './panels/LabHoldTimeAdapter.svelte';

  let mode = $state<'auto' | 'manual'>('auto');
  let activeTab = $state<'strategy' | 'result' | 'order' | 'trades' | 'refinement' | 'pattern-run'>('strategy');
  let interval = $state('4h');
  let isRunning = $state(false);
  let error = $state<string | null>(null);
  let sourceCapture = $state<PatternCaptureRecord | null>(null);
  let captureHydrationState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let captureHydrationError = $state<string | null>(null);
  let captureOpen = $state(false);

  let klines = $state<BinanceKline[]>([]);
  let chartMarkers = $state<ChartMarker[]>([]);
  let chartPriceLines = $state<PriceLine[]>([]);
  let revealedBars = $state(0);

  let backtestResult = $state<BacktestResult | null>(null);
  let selectedTradeIndex = $state(-1);

  // W-0381: equity series derived from backtest result + klines
  const equitySeries = $derived<EquitySeries>(buildEquitySeries(backtestResult, klines));

  let manualPosition = $state<{
    direction: string;
    entryPrice: number;
    currentPrice: number;
    pnlPercent: number;
    slPrice: number;
    tpPrice: number;
  } | null>(null);

  const entry = $derived($activeStrategy);
  const strat = $derived(entry?.strategy ?? null);
  const selectedCycles = $derived(
    entry?.selectedCycles ?? ['2020-covid', '2021-bull', '2022-bear', '2023-recovery']
  );
  const strategies = $derived($allStrategies);
  const testedChallengeCount = $derived(strategies.filter((item) => item.lastResult).length);
  const pendingChallengeCount = $derived(Math.max(strategies.length - testedChallengeCount, 0));
  const activeChallengeLabel = $derived(strat?.name ?? 'No challenge selected');

  function storageKeyForCaptureDraft(captureId: string): string {
    return `lab:capture-draft:${captureId}`;
  }

  async function hydrateCaptureDraftFromUrl(): Promise<void> {
    const searchParams = new URLSearchParams(window.location.search);
    const captureId = searchParams.get('captureId');
    if (!captureId) return;

    captureHydrationState = 'loading';
    captureHydrationError = null;
    try {
      const capture = await fetchPatternCaptureById(captureId);
      if (!capture) throw new Error('capture_not_found');
      sourceCapture = capture;

      const storageKey = storageKeyForCaptureDraft(capture.id);
      const existingStrategyId = window.sessionStorage.getItem(storageKey);
      const state = get(strategyStore);
      if (existingStrategyId && state.entries[existingStrategyId]) {
        setActiveStrategy(existingStrategyId);
        interval = buildLabDraftFromCapture(capture).interval;
      } else {
        const draft = buildLabDraftFromCapture(capture);
        const strategyId = createStrategy(draft.name, draft.direction);
        for (const condition of draft.conditions) {
          addCondition(strategyId, condition);
        }
        setActiveStrategy(strategyId);
        interval = draft.interval;
        window.sessionStorage.setItem(storageKey, strategyId);
      }

      captureHydrationState = 'ready';
    } catch (err) {
      captureHydrationState = 'error';
      captureHydrationError = err instanceof Error ? err.message : 'capture_hydration_failed';
    }
  }

  onMount(() => {
    void hydrateCaptureDraftFromUrl();
  });

  // Auto-run backtest when navigated from "이거 찾아줘" (captureId + autorun=1 in URL)
  $effect(() => {
    if (
      captureHydrationState === 'ready' &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autorun') === '1' &&
      strat &&
      !isRunning &&
      !backtestResult
    ) {
      void runBacktest();
    }
  });

  $effect(() => {
    const store = $strategyStore;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('captureId')) {
      return;
    }
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

      allKlines.sort((a: BinanceKline, b: BinanceKline) => a.time - b.time);
      klines = allKlines;
      revealedBars = allKlines.length;

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
      marks.push({
        time: t.entryTime,
        position: t.direction === 'long' ? 'belowBar' : 'aboveBar',
        color: t.direction === 'long' ? '#adca7c' : '#cf7f8f',
        shape: t.direction === 'long' ? 'arrowUp' : 'arrowDown',
        text: t.direction === 'long' ? 'L' : 'S',
      });
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

    chartPriceLines = [
      { price: trade.slPrice, color: '#cf7f8f', lineWidth: 1, lineStyle: 2, title: `SL ${trade.slPrice.toFixed(0)}` },
      { price: trade.tpPrice, color: '#adca7c', lineWidth: 1, lineStyle: 2, title: `TP ${trade.tpPrice.toFixed(0)}` },
      { price: trade.entryPrice, color: '#f2d193', lineWidth: 1, lineStyle: 1, title: `Entry ${trade.entryPrice.toFixed(0)}` },
    ];
  }

  async function loadCycleForManual() {
    if (selectedCycles.length === 0) return;
    const cycleId = selectedCycles[0];
    try {
      const res = await fetch(`/api/cycles/klines?cycleId=${cycleId}&interval=${interval}`);
      if (!res.ok) return;
      const data = await res.json();
      klines = data.klines;
      revealedBars = Math.min(50, data.klines.length);
      chartMarkers = [];
      chartPriceLines = [];
      manualPosition = null;
    } catch {}
  }

  function nextBar() {
    if (revealedBars < klines.length) {
      revealedBars++;
      if (manualPosition && revealedBars > 0) {
        const currentBar = klines[revealedBars - 1];
        manualPosition = {
          ...manualPosition,
          currentPrice: currentBar.close,
          pnlPercent:
            manualPosition.direction === 'long'
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
  function handleImport() {}
  function handleClosePosition() { manualPosition = null; chartPriceLines = []; }
</script>

<PageCover title="LAB" description="Coming soon." />

<svelte:head>
  <title>Lab — Cogochi</title>
  <meta
    name="description"
    content="Build, replay, and validate trading setups across market cycles in the Cogochi lab."
  />
  <link rel="canonical" href={buildCanonicalHref('/lab')} />
</svelte:head>

<div class="surface-page chrome-layout lab">
  <!-- Compact Topbar -->
  <header class="surface-hero surface-fixed-hero">
    <div class="surface-copy">
      <span class="surface-kicker">Lab</span>
      <h1 class="surface-title">Challenge Lab</h1>
    </div>
    <div class="surface-stats">
      <article class="surface-stat">
        <span class="surface-meta">Selected</span>
        <strong>{activeChallengeLabel}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Tested</span>
        <strong>{testedChallengeCount}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Waiting</span>
        <strong>{pendingChallengeCount}</strong>
      </article>
      <a class="surface-sublink" href="/lab/counterfactual" data-testid="lab-counterfactual-link">
        Counterfactual →
      </a>
    </div>
  </header>

  <div class="surface-scroll-body">
    {#if captureHydrationState !== 'idle' || sourceCapture}
      <section class="surface-card soft source-capture-shell">
        <button class="capture-toggle" onclick={() => (captureOpen = !captureOpen)}>
          <span class="surface-kicker">Source Capture</span>
          {#if sourceCapture}
            <span class="capture-summary">{sourceCapture.symbol} · {sourceCapture.timeframe.toUpperCase()} · {sourceCapture.decision.verdict ?? 'unrated'}</span>
          {:else}
            <span class="capture-summary">{captureHydrationState === 'loading' ? 'Hydrating…' : 'Awaiting capture'}</span>
          {/if}
          <span class="capture-toggle-arrow">{captureOpen ? '▲' : '▼'}</span>
        </button>
        {#if captureOpen}
          {#if captureHydrationState === 'error'}
            <p class="capture-error">Failed to load capture into Lab: {captureHydrationError}</p>
          {:else if sourceCapture}
            <div class="capture-grid">
              <div>
                <strong>{sourceCapture.symbol}</strong>
                <small>{sourceCapture.timeframe.toUpperCase()} · {sourceCapture.triggerOrigin}</small>
              </div>
              <div>
                <strong>{sourceCapture.reason ?? 'capture'}</strong>
                <small>{new Date(sourceCapture.updatedAt).toLocaleString()}</small>
              </div>
              <div>
                <strong>{sourceCapture.decision.verdict ?? 'unrated'}</strong>
                <small>Evaluation direction seed</small>
              </div>
              <div>
                <a href={`/cogochi?symbol=${encodeURIComponent(sourceCapture.symbol)}`}>Back to Terminal →</a>
              </div>
            </div>
            {#if sourceCapture.note}
              <p class="capture-note">{sourceCapture.note}</p>
            {/if}
          {/if}
        {/if}
      </section>
    {/if}

    <!-- Run Controls -->
    <section class="surface-card soft">
      <div class="surface-section-head">
        <div>
          <span class="surface-kicker">Run Controls</span>
          <h2>Select & Run Challenge</h2>
        </div>
        <span class="surface-chip">{mode === 'auto' ? 'Auto mode' : 'Manual mode'}</span>
      </div>
      <div class="toolbar-shell">
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
      </div>
    </section>

    <!-- Workspace -->
    <section class="lab-workspace">
      <div class="surface-panel chart-shell">
        <div class="workspace-head">
          <div>
            <span class="surface-kicker">Replay Canvas</span>
            <h2>Read Results Over Market Zone</h2>
          </div>
          <span class="surface-chip">{interval}</span>
        </div>
        <div class="chart-area">
          <LabChart
            {klines}
            revealedCount={revealedBars}
            markers={chartMarkers}
            priceLines={chartPriceLines}
            {mode}
          />
        </div>
      </div>

      <div class="surface-panel panel-shell">
        <div class="workspace-head tabs-head">
          <div>
            <span class="surface-kicker">Context</span>
            <h2>{mode === 'auto' ? 'Challenge & Run Results' : 'Replay & Log'}</h2>
          </div>
        </div>

        <div class="tab-bar" class:tab-bar-4={mode === 'auto'}>
          {#if mode === 'auto'}
            <button class="tab" class:active={activeTab === 'strategy'} onclick={() => activeTab = 'strategy'}>Strategy</button>
            <button class="tab" class:active={activeTab === 'result'} onclick={() => activeTab = 'result'}>Results</button>
            <button class="tab" class:active={activeTab === 'refinement'} onclick={() => activeTab = 'refinement'}>Refinement</button>
            <button class="tab" class:active={activeTab === 'pattern-run'} onclick={() => activeTab = 'pattern-run'}>Pattern Run</button>
          {:else}
            <button class="tab" class:active={activeTab === 'order'} onclick={() => activeTab = 'order'}>Replay</button>
            <button class="tab" class:active={activeTab === 'trades'} onclick={() => activeTab = 'trades'}>Trade Log</button>
          {/if}
        </div>

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
            <!-- W-0395 Ph6: hold time distribution at the top of results -->
            <LabHoldTimeAdapter trades={backtestResult?.trades ?? []} />
            <!-- W-0381: Bloomberg-style backtest dashboard -->
            <BacktestSummaryStrip result={backtestResult} {isRunning} />
            <EquityCurveChart
              series={equitySeries}
              height={240}
              selectedTradeTime={selectedTradeIndex >= 0 ? backtestResult?.trades[selectedTradeIndex]?.exitTime ?? null : null}
            />
            <TradeLogTable
              trades={backtestResult?.trades ?? []}
              selectedIndex={selectedTradeIndex}
              {interval}
              onSelectTrade={(idx) => selectTrade(idx)}
            />
          {:else if activeTab === 'refinement'}
            <RefinementPanel />
          {:else if activeTab === 'pattern-run'}
            <PatternRunPanel />
          {:else if activeTab === 'order'}
            <div class="manual-order">
              <div class="manual-hero">
                <span class="surface-meta">Quick Replay</span>
                <p>Open long/short at current bar and advance one bar at a time.</p>
              </div>
              <div class="order-buttons">
                <button
                  class="order-btn long"
                  disabled={!!manualPosition}
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
                <button
                  class="order-btn short"
                  disabled={!!manualPosition}
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

              {#if manualPosition}
                <div class="manual-stats">
                  <div><span class="surface-meta">Direction</span><strong>{manualPosition.direction.toUpperCase()}</strong></div>
                  <div><span class="surface-meta">Entry</span><strong>{manualPosition.entryPrice.toFixed(0)}</strong></div>
                  <div><span class="surface-meta">Current</span><strong>{manualPosition.currentPrice.toFixed(0)}</strong></div>
                  <div>
                    <span class="surface-meta">Unrealized</span>
                    <strong class={manualPosition.pnlPercent >= 0 ? 'surface-value-positive' : 'surface-value-negative'}>
                      {manualPosition.pnlPercent >= 0 ? '+' : ''}{manualPosition.pnlPercent.toFixed(2)}%
                    </strong>
                  </div>
                </div>
              {/if}
            </div>
          {:else if activeTab === 'trades'}
            <div class="trades-empty">
              <span class="surface-meta">Manual Log</span>
              <p>Manual replay log shown here.</p>
            </div>
          {/if}
        </div>
      </div>
    </section>

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
      <div class="surface-card error-bar">{error}</div>
    {/if}
  </div>
</div>

<style>
  .surface-sublink {
    align-self: center;
    margin-left: 8px;
    padding: 4px 10px;
    color: var(--amb, #f5a623);
    font-size: 11px;
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 1px solid var(--amb, #f5a623);
    border-radius: 2px;
  }
  .surface-sublink:hover { background: rgba(245, 166, 35, 0.12); }

  .toolbar-shell {
    margin-top: 14px;
    overflow: auto;
  }

  .lab-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.18fr) minmax(300px, 0.82fr);
    gap: 16px;
    min-height: 0;
  }

  .chart-shell,
  .panel-shell {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }

  .workspace-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
  }

  .workspace-head h2 {
    margin: 4px 0 0;
    color: rgba(250, 247, 235, 0.98);
    font-size: clamp(1rem, 1.8vw, 1.2rem);
    line-height: 1.1;
    letter-spacing: -0.03em;
  }

  .chart-area {
    flex: 1;
    min-height: 480px;
    overflow: hidden;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }

  .tab-bar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .tab-bar.tab-bar-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tab-bar.tab-bar-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .tab {
    min-height: 36px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(250, 247, 235, 0.62);
    font-family: var(--sc-font-body);
    font-size: 0.84rem;
    font-weight: 600;
    transition: background var(--sc-duration-fast), border-color var(--sc-duration-fast), color var(--sc-duration-fast);
  }

  .tab.active {
    background: linear-gradient(180deg, rgba(250, 247, 235, 0.98), rgba(249, 246, 241, 0.96));
    border-color: rgba(219, 154, 159, 0.28);
    color: #0f0f12;
  }

  .tab-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
    padding: 16px;
  }

  .manual-order,
  .trades-empty {
    display: grid;
    gap: 14px;
  }

  .manual-hero p,
  .trades-empty p {
    margin: 4px 0 0;
    color: var(--sc-text-1);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .order-buttons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .order-btn {
    min-height: 42px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    font-family: var(--sc-font-body);
    font-weight: 700;
    transition: transform var(--sc-duration-fast), opacity var(--sc-duration-fast);
  }

  .order-btn.long {
    background: rgba(74, 222, 128, 0.12);
    color: var(--sc-good);
  }

  .order-btn.short {
    background: rgba(248, 113, 113, 0.1);
    color: #ff9ca0;
  }

  .manual-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .manual-stats > div {
    display: grid;
    gap: 4px;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }

  .manual-stats strong {
    color: var(--sc-text-0);
    font-size: 1rem;
    font-weight: 700;
  }

  .error-bar {
    color: #ffb8bc;
  }
  .source-capture-shell {
    margin-bottom: 16px;
    padding: 0;
    overflow: hidden;
  }
  .capture-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: none;
    border: none;
    padding: 10px 16px;
    cursor: pointer;
    text-align: left;
    transition: background 0.08s;
  }
  .capture-toggle:hover { background: rgba(255,255,255,0.02); }
  .capture-summary {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: rgba(250, 247, 235, 0.55);
    flex: 1;
  }
  .capture-toggle-arrow { font-size: var(--ui-text-xs); color: rgba(250,247,235,0.3); }
  .capture-grid { padding: 0 16px 12px; }
  .capture-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .capture-grid strong,
  .capture-grid a {
    display: block;
    color: rgba(243, 247, 252, 0.94);
    font-size: 14px;
  }
  .capture-grid small {
    display: block;
    margin-top: 4px;
    color: rgba(205, 214, 224, 0.62);
    font-size: 12px;
  }
  .capture-grid a {
    color: #7dd3fc;
    text-decoration: underline;
  }
  .capture-note {
    margin: 12px 0 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(148, 163, 184, 0.08);
    color: rgba(233, 239, 245, 0.88);
    line-height: 1.45;
  }
  .capture-error {
    color: #fca5a5;
  }

  @media (max-width: 1024px) {
    .lab-workspace {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .chart-area {
      min-height: 280px;
    }
    .manual-stats,
    .order-buttons {
      gap: 6px;
    }
    .capture-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .tab-content {
      padding: 12px;
    }
  }
</style>
