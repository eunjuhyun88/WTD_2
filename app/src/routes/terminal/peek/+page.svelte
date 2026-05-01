<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { activePairState, setActivePair } from '$lib/stores/activePairStore';
  import {
    fetchTerminalAnalysisBundle,
    fetchScannerAlerts,
    type TerminalAnalyzeData,
  } from '$lib/terminal/terminalDataOrchestrator';
  import {
    fetchPatternCaptures,
    fetchSimilarPatternCaptures,
  } from '$lib/api/terminalPersistence';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';

  import TerminalCommandBar from '../../../components/terminal/workspace/TerminalCommandBar.svelte';
  import ChartBoard from '../../../components/terminal/workspace/ChartBoard.svelte';
  import ScanGrid from '../../../components/terminal/peek/ScanGrid.svelte';
  import IndicatorPanel from '../../../components/terminal/peek/IndicatorPanel.svelte';
  import AIAgentPanel from '../../../components/terminal/peek/AIAgentPanel.svelte';

  // ── State ────────────────────────────────────────────────────────────────
  let analysisData = $state<TerminalAnalyzeData | null>(null);
  let ohlcvBars = $state<any[]>([]);
  let layerBarsMap = $state<Record<string, any[]>>({});
  let chartPayload = $state<ChartSeriesPayload | null>(null);

  let scannerAlerts = $state<any[]>([]);
  let captures = $state<PatternCaptureRecord[]>([]);
  let similar = $state<PatternCaptureRecord[]>([]);
  let loadingSimilar = $state(false);

  let analysisInFlight = '';

  interface RangeSelection { from: number; to: number; fromTime?: number; toTime?: number; }
  let rangeSelection = $state<RangeSelection | null>(null);

  // ── Derived from activePairState ─────────────────────────────────────────
  const activeSymbol = $derived($activePairState.pair.replace('/', '').toUpperCase());
  const activeTf = $derived($activePairState.timeframe);

  // ── Fetchers ─────────────────────────────────────────────────────────────
  async function loadAnalysis(symbol: string, tf: string) {
    if (!symbol) return;
    const key = `${symbol}|${tf}`;
    if (analysisInFlight === key) return;
    analysisInFlight = key;
    try {
      const bundle = await fetchTerminalAnalysisBundle({ symbol, tf });
      if (analysisInFlight !== key) return;
      analysisData = bundle.analysisData;
      ohlcvBars = bundle.ohlcvBars;
      layerBarsMap = bundle.layerBarsMap;
      chartPayload = bundle.chartPayload;
    } catch (err) {
      console.error('[peek] analysis load failed', err);
    } finally {
      if (analysisInFlight === key) analysisInFlight = '';
    }
  }

  async function loadAlerts() {
    try { scannerAlerts = await fetchScannerAlerts(16); }
    catch (e) { console.error('[peek] alerts', e); }
  }

  async function loadCaptures() {
    try { captures = await fetchPatternCaptures({ limit: 60 }); }
    catch (e) { console.error('[peek] captures', e); }
  }

  async function loadSimilar(symbol: string, tf: string) {
    if (!symbol) return;
    loadingSimilar = true;
    try {
      const draft = { symbol, timeframe: tf, triggerOrigin: 'manual' as const, markers: [] } as any;
      try {
        const matches = await fetchSimilarPatternCaptures(draft);
        similar = (matches ?? []).map((m: any) => m.record ?? m).filter(Boolean);
      } catch {
        similar = captures.filter((r) => r.symbol.toUpperCase().includes(symbol.replace(/USDT$/, '')));
      }
    } finally { loadingSimilar = false; }
  }

  function openCapture(record: PatternCaptureRecord) {
    setActivePair(record.symbol.replace(/USDT$/, '') + '/USDT');
  }

  // ── Range selection from chartSaveMode store ──────────────────────────────
  const unsubRange = chartSaveMode.subscribe((state) => {
    if (state.active && state.anchorA !== null && state.anchorB !== null) {
      const lo = Math.min(state.anchorA, state.anchorB);
      const hi = Math.max(state.anchorA, state.anchorB);
      const klines = ohlcvBars as Array<{ time?: number; t?: number }>;
      const fromIdx = Math.max(0, klines.findIndex(k => (k.time ?? k.t ?? 0) >= lo));
      const toIdx = klines.reduce((acc, k, i) => ((k.time ?? k.t ?? 0) <= hi ? i : acc), fromIdx);
      rangeSelection = { from: fromIdx, to: toIdx, fromTime: lo, toTime: hi };
    } else if (!state.active) {
      rangeSelection = null;
    }
  });

  // ── Auto-refresh on pair change ──────────────────────────────────────────
  $effect(() => {
    const sym = activeSymbol;
    const tf = activeTf;
    untrack(() => {
      if (sym) {
        loadAnalysis(sym, tf);
        loadSimilar(sym, tf);
        rangeSelection = null;
        chartSaveMode.exitRangeMode();
      }
    });
  });

  // ── Mount + periodic refresh ─────────────────────────────────────────────
  let alertTimer: ReturnType<typeof setInterval> | null = null;
  let captureTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    loadAlerts();
    loadCaptures();
    alertTimer = setInterval(loadAlerts, 60_000);
    captureTimer = setInterval(loadCaptures, 120_000);
  });
  onDestroy(() => {
    if (alertTimer) clearInterval(alertTimer);
    if (captureTimer) clearInterval(captureTimer);
    unsubRange();
  });
</script>

<svelte:head>
  <title>Terminal · Peek — wtd-v2</title>
</svelte:head>

<div class="peek-shell">
  <TerminalCommandBar />

  <div class="peek-body">
    <!-- Left rail: scan list -->
    <aside class="left-col">
      <ScanGrid
        alerts={scannerAlerts}
        {similar}
        activeSymbol={activeSymbol}
        {loadingSimilar}
        onOpenCapture={openCapture}
      />
    </aside>

    <!-- Center: chart — always full height, never covered -->
    <main class="center-col">
      <ChartBoard
        symbol={activeSymbol}
        tf={activeTf}
        initialData={chartPayload}
        contextMode="chart"
      />
    </main>

    <!-- Right rail: indicator values + AI agent -->
    <aside class="right-col">
      <IndicatorPanel
        {analysisData}
        symbol={activeSymbol}
        tf={activeTf}
      />
      <AIAgentPanel
        symbol={activeSymbol}
        tf={activeTf}
        {analysisData}
        {rangeSelection}
        {ohlcvBars}
        onEnterRangeMode={() => chartSaveMode.enterRangeMode()}
      />
    </aside>
  </div>
</div>

<style>
  :global(html), :global(body) {
    height: 100%; margin: 0; background: var(--sc-bg-0, #0b0e14);
  }
  .peek-shell {
    display: flex; flex-direction: column; height: 100vh; width: 100vw;
    overflow: hidden; background: var(--sc-bg-0, #0b0e14); color: var(--sc-text-0, #f7f2ea);
  }
  .peek-body { display: flex; flex: 1; min-height: 0; overflow: hidden; }
  .left-col {
    width: 220px; flex-shrink: 0; border-right: 1px solid rgba(255,255,255,0.06);
    overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .center-col { flex: 1; min-width: 0; position: relative; }
  .right-col {
    width: 260px; flex-shrink: 0; border-left: 1px solid rgba(255,255,255,0.06);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .right-col :global(.ind-panel) { flex: 1; min-height: 0; overflow-y: auto; }
  .right-col :global(.aap) { flex-shrink: 0; max-height: 50%; overflow-y: auto; }

  @media (max-width: 959px) {
    .left-col { display: none; }
    .right-col { width: 220px; }
  }
</style>
