<script lang="ts">
  import LiveSignalPanel from '$lib/components/live/LiveSignalPanel.svelte';
  import DecisionHUD from '../workspace/DecisionHUD.svelte';
  import WhaleWatchCard from '../workspace/WhaleWatchCard.svelte';
  import PatternClassBreakdown from '$lib/components/terminal/PatternClassBreakdown.svelte';
  import type { TerminalAnalyzeData } from '$lib/terminal/terminalDataOrchestrator';
  import type { LiveSignal } from '$lib/terminal/terminalDataOrchestrator';
  import type { TerminalAsset, TerminalVerdict } from '$lib/types/terminal';

  interface ScanEntry { asset: TerminalAsset; verdict: TerminalVerdict | null; }

  interface Props {
    isStreaming: boolean;
    isScanMode: boolean;
    scanAssets: ScanEntry[];
    boardAssetsCount: number;
    liveSignals: LiveSignal[];
    liveSignalsCached: boolean;
    liveSignalsScannedAt: string;
    activeSymbol: string;
    activePairDisplay: string;
    isLoadingActive: boolean;
    heroAsset: TerminalAsset | null;
    heroVerdict: TerminalVerdict | null;
    analysisData: TerminalAnalyzeData | null;
    newsData: any;
    activeAnalysisTab: string;
    ohlcvBars: any[];
    layerBarsMap: Record<string, any[]>;
    patternRecallMatches: any;
    isActivePinned: boolean;
    hasActiveSavedAlert: boolean;
    verdictMap: Record<string, TerminalVerdict>;
    loadingSymbols: Set<string>;
    /** W-0322: similar captures for PatternClassBreakdown */
    similarCaptures?: any[];
    /** W-0322: pattern phases for classification */
    patternPhases?: Array<{ phaseName?: string; symbols?: string[] }>;
    onTabChange: (tab: string) => void;
    onAction: (text: string) => void;
    onPinToggle: () => Promise<void>;
    onAlertToggle: () => Promise<void>;
    onRetry: () => void;
    onSelectAsset: (symbol: string) => void;
    onClearBoard: () => void;
    onWorkspaceToggle?: () => void;
  }

  let {
    isStreaming,
    isScanMode,
    scanAssets,
    boardAssetsCount,
    liveSignals,
    liveSignalsCached,
    liveSignalsScannedAt,
    activeSymbol,
    activePairDisplay,
    isLoadingActive,
    heroAsset,
    heroVerdict,
    analysisData,
    newsData,
    activeAnalysisTab,
    ohlcvBars,
    layerBarsMap,
    patternRecallMatches,
    isActivePinned,
    hasActiveSavedAlert,
    verdictMap,
    loadingSymbols,
    similarCaptures = [],
    patternPhases = [],
    onTabChange,
    onAction,
    onPinToggle,
    onAlertToggle,
    onRetry,
    onSelectAsset,
    onClearBoard,
    onWorkspaceToggle,
  }: Props = $props();
</script>

<aside class="right-rail">
  <div class="rail-header">
    {#if isStreaming}
      <span class="rail-badge streaming">
        <span class="stream-dot pulsing">●</span>
        Analyzing…
      </span>
    {:else if isScanMode}
      <span class="rail-badge scan">{boardAssetsCount} RESULTS</span>
      <button class="rail-back" onclick={onClearBoard}>← Back</button>
    {:else}
      <span class="rail-mode">Analysis</span>
      <span class="rail-sym">{activeSymbol ? activeSymbol.replace('USDT','') : activePairDisplay}</span>
    {/if}
  </div>

  {#if liveSignals.length > 0}
    <LiveSignalPanel
      signals={liveSignals}
      cached={liveSignalsCached}
      scannedAt={liveSignalsScannedAt}
    />
  {/if}

  {#if isScanMode}
    <div class="scan-list">
      {#each scanAssets as { asset, verdict } (asset.symbol)}
        {@const sym = asset.symbol.replace('USDT','')}
        {@const dir = verdict?.direction ?? asset.bias}
        {@const active = asset.symbol === activeSymbol}
        {@const chg = asset.changePct4h ?? null}
        {@const fr = asset.fundingRate ?? null}
        {@const price = asset.lastPrice ?? null}
        <button
          class="scan-card"
          class:active
          class:bullish={dir === 'bullish'}
          class:bearish={dir === 'bearish'}
          onclick={() => onSelectAsset(asset.symbol)}
        >
          <div class="sc-left">
            <span class="sc-sym">{sym}</span>
            {#if price != null}
              <span class="sc-price">{price >= 1000
                ? price.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : price >= 1 ? price.toFixed(2)
                : price.toPrecision(4)}</span>
            {:else}
              <span class="sc-venue">USDT·PERP</span>
            {/if}
          </div>
          <div class="sc-right">
            <div class="sc-top-row">
              <span class="sc-dir">{dir?.toUpperCase() ?? '—'}</span>
              {#if chg != null}
                <span class="sc-chg" class:chg-up={chg >= 0} class:chg-dn={chg < 0}>
                  {chg >= 0 ? '▲' : '▼'}{Math.abs(chg).toFixed(2)}%
                </span>
              {/if}
            </div>
            <div class="sc-meta-row">
              {#if fr != null}
                <span class="sc-fr" class:fr-high={fr > 0.05} class:fr-neg={fr < -0.01}>
                  F:{fr >= 0 ? '+' : ''}{fr.toFixed(4)}%
                </span>
              {/if}
              {#if verdict?.reason}
                <span class="sc-reason">{verdict.reason.slice(0, 32)}{verdict.reason.length > 32 ? '…' : ''}</span>
              {:else if verdictMap[asset.symbol] === undefined && loadingSymbols.has(asset.symbol)}
                <span class="sc-loading">analyzing…</span>
              {/if}
            </div>
          </div>
        </button>
      {/each}
    </div>
    {#if heroAsset && heroVerdict}
      <div class="scan-detail">
        <DecisionHUD
          analysisData={analysisData as any}
          isStreaming={isStreaming}
          symbol={activeSymbol}
          onAction={onAction}
        />
      </div>
    {/if}
  {:else if isLoadingActive && !heroVerdict}
    <div class="board-loading">
      <div class="loading-ring"></div>
      <p class="loading-msg">Analyzing {activePairDisplay}…</p>
    </div>
  {:else if heroAsset && heroVerdict}
    <DecisionHUD
      analysisData={analysisData as any}
      isStreaming={isStreaming}
      isLoading={isLoadingActive && !heroVerdict}
      symbol={activeSymbol}
      onAction={onAction}
      onWorkspaceToggle={onWorkspaceToggle}
    />
    <!-- W-0210 Layer 2: Whale Watch — Hyperliquid top traders -->
    <div class="whale-wrap">
      <WhaleWatchCard symbol={activeSymbol} />
    </div>
    <!-- W-0322: Pattern classification breakdown -->
    <PatternClassBreakdown
      similar={similarCaptures}
      phases={patternPhases}
    />
  {:else}
    <div class="board-empty">
      <p class="empty-icon">◈</p>
      <p class="empty-text">No analysis loaded</p>
      <button class="empty-retry-btn" onclick={onRetry}>
        Analyze {activePairDisplay} →
      </button>
    </div>
  {/if}
</aside>

<style>
  .right-rail {
    width: 320px;
    flex-shrink: 0;
    border-left: 1px solid rgba(255,255,255,0.06);
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    background: var(--sc-bg-0, #0b0e14);
  }

  @media (max-width: 1279px) { .right-rail { width: 280px; } }
  @media (max-width: 959px)  { .right-rail { display: none; } }

  .rail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    flex-shrink: 0;
    min-height: 44px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0)),
      rgba(255,255,255,0.015);
  }
  .rail-mode {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.40);
    text-transform: uppercase;
  }
  .rail-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: rgba(255,255,255,0.88);
    margin-left: auto;
    letter-spacing: 0.06em;
  }
  .rail-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.08em;
    padding: 2px 7px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .rail-badge.streaming {
    background: rgba(74,222,128,0.09);
    color: #4ade80;
    border: 1px solid rgba(74,222,128,0.24);
  }
  .rail-badge.scan {
    background: rgba(99,179,237,0.09);
    color: #63b3ed;
    border: 1px solid rgba(99,179,237,0.24);
  }
  .stream-dot.pulsing { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .rail-back {
    margin-left: auto;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.48);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .rail-back:hover { color: rgba(255,255,255,0.82); border-color: rgba(255,255,255,0.28); }

  .scan-list {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
  }
  .scan-card {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
    width: 100%;
  }
  .scan-card:hover  { background: rgba(255,255,255,0.05); }
  .scan-card.active { background: rgba(255,255,255,0.07); }
  .scan-card.bullish .sc-dir { color: #4ade80; }
  .scan-card.bearish .sc-dir { color: #f87171; }
  .sc-left  { display: flex; flex-direction: column; gap: 2px; min-width: 56px; }
  .sc-sym   { font-family: var(--sc-font-mono, monospace); font-size: 12px; font-weight: 700; color: #fff; }
  .sc-venue { font-size: 9px; color: rgba(255,255,255,0.30); font-family: var(--sc-font-mono, monospace); }
  .sc-price { font-family: var(--sc-font-mono, monospace); font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.70); }
  .sc-right { display: flex; flex-direction: column; gap: 2px; flex: 1; align-items: flex-end; }
  .sc-top-row { display: flex; align-items: center; gap: 5px; }
  .sc-dir   { font-family: var(--sc-font-mono, monospace); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255,255,255,0.48); }
  .sc-chg   { font-family: var(--sc-font-mono, monospace); font-size: 9px; font-weight: 700; }
  .sc-chg.chg-up { color: #22ab94; }
  .sc-chg.chg-dn { color: #f23645; }
  .sc-meta-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .sc-fr    { font-family: var(--sc-font-mono, monospace); font-size: 8px; font-weight: 600; color: rgba(255,255,255,0.38); letter-spacing: 0.04em; }
  .sc-fr.fr-high { color: rgba(242,54,69,0.82); }
  .sc-fr.fr-neg  { color: rgba(34,171,148,0.82); }
  .sc-reason  { font-size: 9px; color: rgba(255,255,255,0.38); text-align: right; line-height: 1.2; }
  .sc-loading { font-size: 9px; color: rgba(255,255,255,0.25); font-family: var(--sc-font-mono, monospace); animation: sc-pulse 1.4s ease-in-out infinite; }
  @keyframes sc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .scan-detail { flex: 1; min-height: 0; overflow: hidden; }

  .board-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    opacity: 0.70;
  }
  .empty-icon { font-size: 32px; color: var(--sc-text-3); margin: 0; }
  .empty-text { font-family: var(--sc-font-mono); font-size: 13px; color: var(--sc-text-2); margin: 0; }
  .empty-retry-btn {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(247, 242, 234, 0.85);
    background: rgba(77, 143, 245, 0.09);
    border: 1px solid rgba(99, 179, 237, 0.26);
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
    margin-top: 4px;
  }
  .empty-retry-btn:hover {
    background: rgba(77, 143, 245, 0.18);
    border-color: rgba(99, 179, 237, 0.44);
    color: rgba(247, 242, 234, 1);
  }

  .board-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    opacity: 0.65;
  }
  .loading-ring {
    width: 36px; height: 36px;
    border: 2px solid rgba(255,255,255,0.09);
    border-top-color: var(--sc-text-2);
    border-radius: 50%;
    animation: sc-spin 0.9s linear infinite;
  }
  .loading-msg { font-family: var(--sc-font-mono); font-size: 13px; color: var(--sc-text-2); margin: 0; }
  @keyframes sc-spin { to { transform: rotate(360deg); } }

  /* W-0210 Layer 2: Whale Watch wrapper */
  .whale-wrap {
    padding: 8px 8px 0;
    flex-shrink: 0;
  }
</style>
