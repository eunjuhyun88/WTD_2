<script lang="ts">
  import LiveSignalPanel from '$lib/components/live/LiveSignalPanel.svelte';
  import DecisionHUD from '../workspace/DecisionHUD.svelte';
  import WhaleWatchCard from '../workspace/WhaleWatchCard.svelte';
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
    onTabChange,
    onAction,
    onPinToggle,
    onAlertToggle,
    onRetry,
    onSelectAsset,
    onClearBoard,
    onWorkspaceToggle,
  }: Props = $props();

  // ── Prompt ──────────────────────────────────────────────────────────────────
  let promptDraft = $state('');

  function submitPrompt() {
    const text = promptDraft.trim();
    if (!text) return;
    onAction(text);
    promptDraft = '';
  }

  function onPromptKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitPrompt();
    }
  }

  // ── Accordion ───────────────────────────────────────────────────────────────
  // Track up to 2 expanded symbols; oldest auto-collapses when 3rd is opened
  let expandedSymbols = $state<string[]>([]);

  function toggleExpand(symbol: string) {
    if (expandedSymbols.includes(symbol)) {
      expandedSymbols = expandedSymbols.filter(s => s !== symbol);
    } else {
      const next = [...expandedSymbols, symbol];
      expandedSymbols = next.length > 2 ? next.slice(1) : next;
    }
  }

  function isExpanded(symbol: string) {
    return expandedSymbols.includes(symbol);
  }

  // ── Decision Summary derivations ────────────────────────────────────────────
  const decisionDir   = $derived(heroVerdict?.direction ?? null);
  const decisionPWin  = $derived(analysisData?.p_win != null ? Math.round((analysisData.p_win as number) * 100) : null);
  const _atr          = $derived((analysisData as any)?.deep?.atr_levels ?? {});
  const decisionEntry = $derived(_atr.entry_long ?? _atr.entry ?? null);
  const decisionStop  = $derived(_atr.stop_long  ?? _atr.stop  ?? null);
  const decisionTP    = $derived(_atr.tp1_long   ?? _atr.tp1   ?? _atr.target ?? null);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function fmtPrice(p: number): string {
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1)     return p.toFixed(2);
    return p.toPrecision(4);
  }

  function fmtLevel(p: number | null): string {
    if (p == null || !Number.isFinite(p)) return '—';
    return p >= 10000
      ? p.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : p >= 1 ? p.toFixed(2) : p.toPrecision(4);
  }

  function fmtPct(n: number, digits = 2): string {
    return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
  }

  function dirColor(dir: string | undefined): string {
    if (dir === 'bullish') return '#22ab94';
    if (dir === 'bearish') return '#f23645';
    return 'rgba(255,255,255,0.45)';
  }

  function dirLabel(dir: string | undefined): string {
    if (dir === 'bullish') return 'LONG';
    if (dir === 'bearish') return 'SHORT';
    return 'NEUT';
  }

  function tfColor(tf: string | undefined): string {
    if (tf === '↑') return '#22ab94';
    if (tf === '↓') return '#f23645';
    return 'rgba(255,255,255,0.35)';
  }
</script>

<aside class="right-rail">

  <!-- ── Sticky prompt ─────────────────────────────────────────────────── -->
  <div class="rail-prompt">
    <textarea
      class="prompt-input"
      placeholder="Ask AI…  (Enter to send)"
      bind:value={promptDraft}
      onkeydown={onPromptKeydown}
      rows={2}
    ></textarea>
    <button
      class="prompt-send"
      onclick={submitPrompt}
      disabled={!promptDraft.trim() || isStreaming}
      aria-label="Send"
    >
      {#if isStreaming}
        <span class="send-dot pulsing">●</span>
      {:else}
        ↑
      {/if}
    </button>
  </div>

  <!-- ── Header ───────────────────────────────────────────────────────── -->
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

  <!-- ── Decision Summary (analysis mode only) ────────────────────────── -->
  {#if !isScanMode && decisionDir}
    <div class="decision-summary" class:bull={decisionDir === 'bullish'} class:bear={decisionDir === 'bearish'}>
      <div class="ds-top">
        <span class="ds-dir" class:bull={decisionDir === 'bullish'} class:bear={decisionDir === 'bearish'}>
          {decisionDir === 'bullish' ? 'LONG' : decisionDir === 'bearish' ? 'SHORT' : 'NEUTRAL'}
        </span>
        {#if decisionPWin !== null}
          <span class="ds-pwin" class:pwin-high={decisionPWin >= 60} class:pwin-low={decisionPWin < 40}>
            P(win) {decisionPWin}%
          </span>
        {/if}
      </div>
      <div class="ds-levels">
        <div class="ds-level">
          <span class="ds-lbl">ENTRY</span>
          <span class="ds-val entry">{fmtLevel(decisionEntry)}</span>
        </div>
        <div class="ds-level">
          <span class="ds-lbl">TP</span>
          <span class="ds-val tp">{fmtLevel(decisionTP)}</span>
        </div>
        <div class="ds-level">
          <span class="ds-lbl">SL</span>
          <span class="ds-val sl">{fmtLevel(decisionStop)}</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Live signals ─────────────────────────────────────────────────── -->
  {#if liveSignals.length > 0}
    <LiveSignalPanel
      signals={liveSignals}
      cached={liveSignalsCached}
      scannedAt={liveSignalsScannedAt}
    />
  {/if}

  <!-- ── Scan mode: accordion list ────────────────────────────────────── -->
  {#if isScanMode}
    <div class="scan-accordion">
      {#each scanAssets as { asset, verdict } (asset.symbol)}
        {@const sym = asset.symbol.replace('USDT', '')}
        {@const dir = verdict?.direction ?? asset.bias}
        {@const expanded = isExpanded(asset.symbol)}
        {@const loading = verdictMap[asset.symbol] === undefined && loadingSymbols.has(asset.symbol)}
        {@const chg4h = asset.changePct4h ?? 0}
        {@const fr   = asset.fundingRate ?? 0}
        {@const oi   = asset.oiChangePct1h ?? 0}
        {@const vol  = asset.volumeRatio1h ?? 0}

        <!-- Compact row -->
        <div class="ac-item" class:expanded class:bullish={dir === 'bullish'} class:bearish={dir === 'bearish'}>
          <button
            class="ac-row"
            onclick={() => { onSelectAsset(asset.symbol); toggleExpand(asset.symbol); }}
          >
            <!-- Left: symbol + price -->
            <div class="ac-left">
              <span class="ac-sym">{sym}</span>
              <span class="ac-price">{fmtPrice(asset.lastPrice ?? 0)}</span>
            </div>

            <!-- Center: TF ladder -->
            <div class="ac-tf">
              <span style="color:{tfColor(asset.tf15m)}">{asset.tf15m ?? '·'}</span>
              <span style="color:{tfColor(asset.tf1h)}">{asset.tf1h ?? '·'}</span>
              <span style="color:{tfColor(asset.tf4h)}">{asset.tf4h ?? '·'}</span>
            </div>

            <!-- Right: direction badge + 4h chg -->
            <div class="ac-right">
              <span class="ac-dir" style="color:{dirColor(dir)}">{dirLabel(dir)}</span>
              <span class="ac-chg" class:up={chg4h >= 0} class:dn={chg4h < 0}>
                {fmtPct(chg4h)}
              </span>
            </div>

            <!-- Chevron -->
            <span class="ac-chevron" class:open={expanded}>›</span>
          </button>

          <!-- Expanded detail -->
          {#if expanded}
            <div class="ac-detail">
              <!-- 4-cell indicator grid -->
              <div class="ind-grid">
                <div class="ind-cell">
                  <span class="ind-label">4H CHG</span>
                  <span class="ind-val" class:up={chg4h >= 0} class:dn={chg4h < 0}>{fmtPct(chg4h)}</span>
                </div>
                <div class="ind-cell">
                  <span class="ind-label">FUNDING</span>
                  <span class="ind-val" class:fr-high={fr > 0.05} class:fr-neg={fr < -0.01}>
                    {fr >= 0 ? '+' : ''}{fr.toFixed(4)}%
                  </span>
                </div>
                <div class="ind-cell">
                  <span class="ind-label">OI 1H</span>
                  <span class="ind-val" class:up={oi >= 0} class:dn={oi < 0}>{fmtPct(oi)}</span>
                </div>
                <div class="ind-cell">
                  <span class="ind-label">VOL</span>
                  <span class="ind-val" class:up={vol >= 1.5}>{vol.toFixed(1)}×</span>
                </div>
              </div>

              <!-- TF alignment row -->
              <div class="tf-row">
                <span class="tf-label">TF</span>
                <span class="tf-cell" style="color:{tfColor(asset.tf15m)}">15m {asset.tf15m ?? '·'}</span>
                <span class="tf-cell" style="color:{tfColor(asset.tf1h)}">1h {asset.tf1h ?? '·'}</span>
                <span class="tf-cell" style="color:{tfColor(asset.tf4h)}">4h {asset.tf4h ?? '·'}</span>
              </div>

              <!-- AI reason + invalidation -->
              {#if loading}
                <p class="ac-reason loading">analyzing…</p>
              {:else if verdict?.reason}
                <p class="ac-reason">{verdict.reason}</p>
                {#if verdict.invalidation}
                  <p class="ac-invalidation">⚠ {verdict.invalidation}</p>
                {/if}
              {:else if asset.action}
                <p class="ac-reason">{asset.action}</p>
              {/if}

              <!-- Actions -->
              <div class="ac-actions">
                <button
                  class="ac-btn primary"
                  onclick={() => onAction(`Analyze ${sym} in detail — direction: ${dirLabel(dir)}, 4h change: ${fmtPct(chg4h)}, funding: ${fr.toFixed(4)}%`)}
                >AI Explain →</button>
                <button
                  class="ac-btn"
                  onclick={() => onSelectAsset(asset.symbol)}
                >Full View</button>
              </div>
            </div>
          {/if}
        </div>
      {/each}

      {#if scanAssets.length === 0}
        <div class="scan-empty">
          <span class="scan-empty-icon">◈</span>
          <p>No scan results</p>
        </div>
      {/if}
    </div>

  <!-- ── Analysis mode ────────────────────────────────────────────────── -->
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
    <div class="whale-wrap">
      <WhaleWatchCard symbol={activeSymbol} />
    </div>
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

  /* ── Decision Summary ── */
  .decision-summary {
    flex-shrink: 0;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.015);
  }
  .decision-summary.bull { border-left: 3px solid #22ab94; }
  .decision-summary.bear { border-left: 3px solid #f23645; }

  .ds-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .ds-dir {
    font-family: var(--sc-font-mono, monospace);
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: rgba(255,255,255,0.55);
  }
  .ds-dir.bull { color: #22ab94; }
  .ds-dir.bear { color: #f23645; }

  .ds-pwin {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.45);
  }
  .ds-pwin.pwin-high { color: #22ab94; }
  .ds-pwin.pwin-low  { color: #ef5350; }

  .ds-levels {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .ds-level {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 3px;
    padding: 4px 6px;
  }
  .ds-lbl {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.30);
  }
  .ds-val {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.85);
  }
  .ds-val.entry { color: #fbbf24; }
  .ds-val.tp    { color: #22ab94; }
  .ds-val.sl    { color: #ef5350; }

  /* ── Sticky prompt ── */
  .rail-prompt {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: var(--sc-bg-0, #0b0e14);
    flex-shrink: 0;
  }

  .prompt-input {
    flex: 1;
    resize: none;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 4px;
    padding: 5px 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.85);
    line-height: 1.4;
    min-height: 36px;
    max-height: 80px;
    outline: none;
    transition: border-color 0.1s;
  }
  .prompt-input::placeholder { color: rgba(255,255,255,0.22); }
  .prompt-input:focus { border-color: rgba(255,255,255,0.18); }

  .prompt-send {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    background: rgba(77,143,245,0.14);
    border: 1px solid rgba(99,179,237,0.28);
    border-radius: 4px;
    color: #63b3ed;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s;
    align-self: flex-end;
  }
  .prompt-send:hover:not(:disabled) {
    background: rgba(77,143,245,0.24);
    color: #90cdf4;
  }
  .prompt-send:disabled { opacity: 0.32; cursor: not-allowed; }
  .send-dot.pulsing { animation: pulse 1.2s ease-in-out infinite; font-size: 10px; }

  /* ── Header ── */
  .rail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    flex-shrink: 0;
    min-height: 32px;
    background: rgba(255,255,255,0.015);
  }
  .rail-mode {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.10em;
    color: rgba(255,255,255,0.38);
    text-transform: uppercase;
  }
  .rail-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: rgba(255,255,255,0.88);
    margin-left: auto;
    letter-spacing: 0.04em;
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
  .rail-badge.streaming { background: rgba(74,222,128,0.09); color: #4ade80; border: 1px solid rgba(74,222,128,0.24); }
  .rail-badge.scan      { background: rgba(99,179,237,0.09); color: #63b3ed; border: 1px solid rgba(99,179,237,0.24); }
  .stream-dot.pulsing { animation: pulse 1.2s ease-in-out infinite; }
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

  /* ── Accordion ── */
  .scan-accordion {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .ac-item {
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .ac-item.expanded {
    border-bottom-color: rgba(255,255,255,0.07);
  }
  .ac-item.bullish.expanded { background: rgba(34,171,148,0.04); }
  .ac-item.bearish.expanded { background: rgba(242,54,69,0.04); }

  /* Compact row */
  .ac-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.08s;
  }
  .ac-row:hover { background: rgba(255,255,255,0.04); }
  .ac-item.expanded .ac-row { background: rgba(255,255,255,0.03); }

  .ac-left {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 48px;
  }
  .ac-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.92);
    letter-spacing: 0.02em;
  }
  .ac-price {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.45);
    font-weight: 600;
  }

  .ac-tf {
    display: flex;
    gap: 3px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    flex: 1;
    justify-content: center;
  }

  .ac-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }
  .ac-dir {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .ac-chg {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
  }
  .ac-chg.up { color: #22ab94; }
  .ac-chg.dn { color: #f23645; }

  .ac-chevron {
    font-size: 14px;
    color: rgba(255,255,255,0.25);
    transition: transform 0.15s;
    line-height: 1;
    flex-shrink: 0;
  }
  .ac-chevron.open { transform: rotate(90deg); color: rgba(255,255,255,0.55); }

  /* Expanded detail */
  .ac-detail {
    padding: 0 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  /* 4-cell indicator grid */
  .ind-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
  }
  .ind-cell {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 3px;
    padding: 4px 5px;
  }
  .ind-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
  }
  .ind-val {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    color: rgba(255,255,255,0.80);
  }
  .ind-val.up   { color: #22ab94; }
  .ind-val.dn   { color: #f23645; }
  .ind-val.fr-high { color: rgba(242,54,69,0.90); }
  .ind-val.fr-neg  { color: rgba(34,171,148,0.90); }

  /* TF alignment row */
  .tf-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }
  .tf-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.28);
    min-width: 14px;
  }
  .tf-cell {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
  }

  /* Reason / invalidation */
  .ac-reason {
    font-size: 9px;
    color: rgba(255,255,255,0.55);
    line-height: 1.4;
    margin: 0;
    padding: 3px 0;
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .ac-reason.loading {
    color: rgba(255,255,255,0.25);
    animation: sc-pulse 1.4s ease-in-out infinite;
  }
  .ac-invalidation {
    font-size: 8px;
    color: rgba(239,192,80,0.70);
    line-height: 1.3;
    margin: 0;
  }

  /* Expanded action buttons */
  .ac-actions {
    display: flex;
    gap: 4px;
    padding-top: 2px;
  }
  .ac-btn {
    flex: 1;
    padding: 4px 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.55);
    cursor: pointer;
    transition: all 0.08s;
    text-align: center;
  }
  .ac-btn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.85); }
  .ac-btn.primary {
    border-color: rgba(77,143,245,0.30);
    background: rgba(77,143,245,0.08);
    color: #63b3ed;
  }
  .ac-btn.primary:hover { background: rgba(77,143,245,0.16); }

  /* Scan empty state */
  .scan-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    opacity: 0.5;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255,255,255,0.35);
  }
  .scan-empty-icon { font-size: 24px; }

  /* ── Analysis mode ── */
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
    color: rgba(247,242,234,0.85);
    background: rgba(77,143,245,0.09);
    border: 1px solid rgba(99,179,237,0.26);
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    transition: all 0.12s;
    margin-top: 4px;
  }
  .empty-retry-btn:hover {
    background: rgba(77,143,245,0.18);
    border-color: rgba(99,179,237,0.44);
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
    width: 28px; height: 28px;
    border: 2px solid rgba(255,255,255,0.09);
    border-top-color: var(--sc-text-2);
    border-radius: 50%;
    animation: sc-spin 0.9s linear infinite;
  }
  .loading-msg { font-family: var(--sc-font-mono); font-size: 11px; color: var(--sc-text-2); margin: 0; }

  /* W-0210 Layer 2 */
  .whale-wrap { padding: 6px 6px 0; flex-shrink: 0; }

  @keyframes pulse    { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  @keyframes sc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  @keyframes sc-spin  { to { transform: rotate(360deg); } }
</style>
