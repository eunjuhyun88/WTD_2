<script lang="ts">
  /**
   * Terminal · PEEK layout (DESIGN-ONLY PORT)
   *
   * Full-bleed chart + bottom Peek drawer (ANALYZE / SCAN / JUDGE).
   *
   * Reuses existing stores + fetchers (read-only):
   *   - activePairState (symbol/tf)
   *   - fetchTerminalAnalysisBundle (ANALYZE data)
   *   - fetchScannerAlerts (SCAN alerts)
   *   - fetchPatternCaptures (JUDGE history)
   *   - fetchSimilarPatternCaptures (SCAN similar setups)
   *
   * NOTE: saveJudgment / rejudge are UI-only stubs in this port.
   *       Wire them to real endpoints later — current build is layout only.
   */
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

  import TerminalCommandBar from '../../../components/terminal/workspace/TerminalCommandBar.svelte';
  import ChartBoard from '../../../components/terminal/workspace/ChartBoard.svelte';
  import TerminalContextPanel from '../../../components/terminal/workspace/TerminalContextPanel.svelte';
  import PeekDrawer from '../../../components/terminal/peek/PeekDrawer.svelte';
  import ScanGrid from '../../../components/terminal/peek/ScanGrid.svelte';
  import JudgePanel from '../../../components/terminal/peek/JudgePanel.svelte';

  // ── State ────────────────────────────────────────────────────────────────
  let analysisData = $state<TerminalAnalyzeData | null>(null);
  let ohlcvBars = $state<any[]>([]);
  let layerBarsMap = $state<Record<string, any[]>>({});
  let chartPayload = $state<ChartSeriesPayload | null>(null);

  let scannerAlerts = $state<any[]>([]);
  let captures = $state<PatternCaptureRecord[]>([]);
  let similar = $state<PatternCaptureRecord[]>([]);
  let loadingSimilar = $state(false);
  let savingJudgment = $state(false);

  let analyzeTab = $state('summary');
  let analysisInFlight = '';

  // ── Derived from activePairState ─────────────────────────────────────────
  const activeSymbol = $derived(
    ($activePairState.base + $activePairState.quote).toUpperCase()
  );
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
      const draft = {
        symbol,
        timeframe: tf,
        triggerOrigin: 'manual' as const,
        markers: [],
      } as any;
      try {
        const matches = await fetchSimilarPatternCaptures(draft);
        similar = (matches ?? []).map((m: any) => m.record ?? m).filter(Boolean);
      } catch {
        similar = captures.filter(
          (r) => r.symbol.toUpperCase().includes(symbol.replace(/USDT$/, ''))
        );
      }
    } finally {
      loadingSimilar = false;
    }
  }

  // ── Judgment save — UI-only stub (design port). Wire to API later. ───────
  async function saveJudgment(input: { verdict: 'bullish' | 'bearish' | 'neutral'; note: string }) {
    if (savingJudgment) return;
    savingJudgment = true;
    try {
      console.log('[peek] saveJudgment (UI stub)', {
        symbol: activeSymbol,
        timeframe: activeTf,
        ...input,
      });
      // TODO: POST /api/terminal/pattern-captures when backend is ready.
      await new Promise((r) => setTimeout(r, 250));
    } finally {
      savingJudgment = false;
    }
  }

  async function rejudge(input: { captureId: string; outcome: 'correct' | 'wrong' | 'partial' | 'timeout'; note: string }) {
    console.log('[peek] rejudge (UI stub)', input);
    // TODO: PATCH /api/terminal/pattern-captures/[id] when backend route exists.
  }

  function openCapture(record: PatternCaptureRecord) {
    setActivePair(record.symbol.replace(/USDT$/, '') + '/USDT');
  }

  // ── Auto-refresh on pair change ──────────────────────────────────────────
  let pairWatcher = $state(0);
  $effect(() => {
    const sym = activeSymbol;
    const tf = activeTf;
    untrack(() => {
      if (sym) {
        loadAnalysis(sym, tf);
        loadSimilar(sym, tf);
      }
    });
    pairWatcher++;
  });

  // ── Mount + periodic refresh ─────────────────────────────────────────────
  let alertTimer: any = null;
  let captureTimer: any = null;

  onMount(() => {
    loadAlerts();
    loadCaptures();
    alertTimer = setInterval(loadAlerts, 60_000);
    captureTimer = setInterval(loadCaptures, 120_000);
  });
  onDestroy(() => {
    if (alertTimer) clearInterval(alertTimer);
    if (captureTimer) clearInterval(captureTimer);
  });

  // ── Derived counts for peek bar ──────────────────────────────────────────
  const analyzeCount = $derived(analysisData?.verdict ? 1 : 0);
  const scanCount = $derived(scannerAlerts.length);
  const judgeCount = $derived(captures.filter((c: any) => {
    const hasOutcome = c?.outcome?.label || c?.decision?.outcomeLabel;
    return !hasOutcome;
  }).length);

  // ── Verdict extraction for JudgePanel ────────────────────────────────────
  const judgeVerdict = $derived(analysisData?.verdict ?? null);
  const judgeEntry   = $derived((analysisData as any)?.verdict?.entry ?? (analysisData as any)?.deep?.entry ?? null);
  const judgeStop    = $derived((analysisData as any)?.verdict?.stop  ?? (analysisData as any)?.deep?.stop  ?? null);
  const judgeTarget  = $derived((analysisData as any)?.verdict?.target?? (analysisData as any)?.deep?.target?? null);
  const judgePWin    = $derived(analysisData?.p_win ?? null);
  const judgeLast    = $derived((analysisData as any)?.snapshot?.price ?? (analysisData as any)?.snapshot?.last ?? null);
</script>

<svelte:head>
  <title>Terminal · Peek — wtd-v2</title>
</svelte:head>

<div class="peek-shell">
  <TerminalCommandBar />

  <main class="peek-main">
    <div class="chart-wrap">
      <ChartBoard
        symbol={activeSymbol}
        tf={activeTf}
        initialData={chartPayload}
        contextMode="chart"
      />
    </div>

    <PeekDrawer {analyzeCount} {scanCount} {judgeCount}>
      <svelte:fragment slot="analyze">
        <TerminalContextPanel
          {analysisData}
          activeTab={analyzeTab}
          onTabChange={(t) => analyzeTab = t}
          bars={ohlcvBars}
          {layerBarsMap}
        />
      </svelte:fragment>

      <svelte:fragment slot="scan">
        <ScanGrid
          alerts={scannerAlerts}
          {similar}
          {activeSymbol}
          {loadingSimilar}
          onOpenCapture={openCapture}
        />
      </svelte:fragment>

      <svelte:fragment slot="judge">
        <JudgePanel
          symbol={activeSymbol}
          timeframe={activeTf}
          verdict={judgeVerdict}
          entry={judgeEntry}
          stop={judgeStop}
          target={judgeTarget}
          pWin={judgePWin}
          lastPrice={judgeLast}
          {captures}
          saving={savingJudgment}
          onSaveJudgment={saveJudgment}
          onRejudge={rejudge}
          onOpenCapture={openCapture}
        />
      </svelte:fragment>
    </PeekDrawer>
  </main>
</div>

<style>
  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
    background: var(--sc-bg-0, #0b0e14);
  }
  .peek-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--sc-bg-0, #0b0e14);
    color: var(--sc-text-0, #f7f2ea);
  }
  .peek-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .chart-wrap {
    flex: 1;
    min-height: 0;
    position: relative;
  }
</style>
