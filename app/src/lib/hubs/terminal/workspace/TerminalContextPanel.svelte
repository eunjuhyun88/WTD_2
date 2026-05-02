<script lang="ts">
  import type { TerminalEvidence } from '$lib/types/terminal';
  import type { DerivativesEnvelope, SnapshotEnvelope } from '$lib/contracts/terminalBackend';
  import { toneFromRecallScore } from '$lib/terminal/terminalDerived';
  import VerdictHeader from './VerdictHeader.svelte';
  import ActionStrip from './ActionStrip.svelte';
  import EvidenceGrid from './EvidenceGrid.svelte';
  import WhyPanel from './WhyPanel.svelte';
  import StructureExplainViz from './StructureExplainViz.svelte';
  import SourceRow from './SourceRow.svelte';
  import {
    buildEvidenceFromAnalysis,
    buildPanelModel,
    buildSourcesFromAnalysis,
    buildVerdictFromAnalysis,
    type PatternRecallMatch,
    type PanelAnalyzeData,
  } from '$lib/terminal/panelAdapter';
  import { buildStructureExplain } from '$lib/terminal/structureExplain';

  interface Props {
    analysisData?: PanelAnalyzeData | null;
    newsData?: any;
    activeTab?: string;
    onTabChange?: (t: string) => void;
    onAction?: (text: string) => void;
    onPinToggle?: () => void;
    onAlertToggle?: () => void;
    onRetry?: () => void;
    bars?: any[];
    layerBarsMap?: Record<string, any[]>;
    isPinned?: boolean;
    hasSavedAlert?: boolean;
    patternRecallMatches?: PatternRecallMatch[];
  }
  let {
    analysisData,
    newsData,
    activeTab = 'summary',
    onTabChange,
    onAction,
    onPinToggle,
    onAlertToggle,
    onRetry,
    bars = [],
    layerBarsMap = {},
    isPinned = false,
    hasSavedAlert = false,
    patternRecallMatches = [],
  }: Props = $props();

  const TABS = [
    { id: 'summary',   label: 'Summary' },
    { id: 'entry',     label: 'Entry' },
    { id: 'risk',      label: 'Risk' },
    { id: 'catalysts', label: 'Catalysts' },
    { id: 'metrics',   label: 'Metrics' },
  ];

  // ── Deep pipeline data ──────────────────────────────────────────────────
  const deep = $derived(analysisData?.deep ?? null);
  const deepScore: number = $derived(deep?.total_score ?? 0);
  const deepVerdict: string = $derived(deep?.verdict ?? '');
  const atrLevels = $derived(deep?.atr_levels ?? {});

  // ── ML score fields ────────────────────────────────────────────────────
  const pWin: number | null = $derived(analysisData?.p_win ?? null);
  const blocksTriggered: string[] = $derived(analysisData?.blocks_triggered ?? []);
  const ensembleTriggered: boolean = $derived(analysisData?.ensemble_triggered ?? false);
  const DISQUALIFIERS = new Set(['volume_below_average', 'extreme_volatility', 'extended_from_ma']);
  const blocksPositive = $derived(blocksTriggered.filter((b: string) => !DISQUALIFIERS.has(b)));

  function deepScoreColor(s: number): string {
    if (s >= 50)  return 'var(--sc-good, #adca7c)';
    if (s >= 20)  return 'rgba(173,202,124,0.72)';
    if (s <= -50) return 'var(--sc-bad, #cf7f8f)';
    if (s <= -20) return 'rgba(207,127,143,0.72)';
    return 'rgba(247,242,234,0.72)';
  }

  function pWinColor(p: number | null): string {
    if (p == null) return 'rgba(247,242,234,0.4)';
    if (p >= 0.60) return 'var(--sc-good, #adca7c)';
    if (p >= 0.55) return 'rgba(173,202,124,0.72)';
    if (p <= 0.45) return 'var(--sc-bad, #cf7f8f)';
    return 'rgba(247,242,234,0.72)';
  }

  const verdict = $derived(buildVerdictFromAnalysis(analysisData));

  // Detect engine-degraded state: verdict present but all engine layers absent/failed
  const isEngineDegraded = $derived(
    verdict != null && !deepVerdict && pWin == null && (
      verdict.action?.toLowerCase().includes('wait for clarity') ||
      (verdict.against ?? []).some(s =>
        s.toLowerCase().includes('unavail') ||
        s.toLowerCase().includes('engine') ||
        s.toLowerCase().includes('failed') ||
        s.toLowerCase().includes('request failed')
      )
    )
  );

  const structureExplainModel = $derived(buildStructureExplain(deep as Record<string, unknown> | null | undefined));
  const evidence = $derived(buildEvidenceFromAnalysis(analysisData));
  const SOURCES = $derived(buildSourcesFromAnalysis(analysisData));

  const fundingMetrics = $derived(
    evidence.filter(e => ['Funding Rate', 'Funding Pct', 'FR / Flow', 'Funding'].includes(e.metric))
  );
  const oiMetrics = $derived(
    evidence.filter(e => ['OI Change', 'OI Momentum', 'OI Squeeze', 'OI 1H'].includes(e.metric))
  );
  const structureMetrics = $derived(
    evidence.filter(e => !fundingMetrics.includes(e) && !oiMetrics.includes(e))
  );

  function formatPanelPrice(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return value >= 1000
      ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : value.toFixed(4);
  }

  const panelSymbol = $derived(
    String(analysisData?.symbol ?? analysisData?.snapshot?.symbol ?? 'BTCUSDT').replace('USDT', '')
  );
  const panelTimeframe = $derived(String(analysisData?.snapshot?.timeframe ?? analysisData?.timeframe ?? '4h').toUpperCase());
  function formatDistance(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }

  function requestBackendAction(kind: 'alert' | 'entry' | 'risk') {
    const symbol = `${panelSymbol}USDT`;
    const prompts = {
      alert: `Draft backend scanner alert conditions for ${symbol} on ${panelTimeframe}. Include trigger, confirmation, disqualifiers, and invalidation.`,
      entry: `Review the entry plan for ${symbol} on ${panelTimeframe} using current backend analysis. Do not execute trades; return entry, stop, targets, risk, and evidence.`,
      risk: `Run a risk check for ${symbol} on ${panelTimeframe}. Return crowding, liquidity, invalidation, avoid actions, and sources.`,
    } satisfies Record<typeof kind, string>;
    onAction?.(prompts[kind]);
  }

  const panelConclusion = $derived(
    verdict
      ? {
          bias: verdict.direction ? verdict.direction.toUpperCase() : '—',
          action: verdict.action || '—',
          invalidation: verdict.invalidation || '—',
        }
      : { bias: '—', action: '—', invalidation: '—' }
  );
  const panelModel = $derived(
    buildPanelModel({
      analysisData,
      backendSnapshot: (analysisData?.backendSnapshot as SnapshotEnvelope | null | undefined) ?? null,
      derivativesSnapshot: (analysisData?.derivativesSnapshot as DerivativesEnvelope | null | undefined) ?? null,
      verdict,
      evidence,
      sources: SOURCES,
      pWin,
      panelSymbol,
      panelTimeframe,
    })
  );
  const summaryEvidence = $derived(evidence.slice(0, 4));
</script>

<aside class="context-panel">
  {#if verdict}
    <div class="verdict-hero" class:bull={verdict.direction === 'bullish'} class:bear={verdict.direction === 'bearish'}>
      <div class="vh-top">
        <span class="vh-dir">{verdict.direction?.toUpperCase() ?? '—'}</span>
        <span class="vh-action">{verdict.action || '—'}</span>
      </div>
      {#if verdict.invalidation}
        <div class="vh-inv">
          <span class="vh-inv-label">If wrong</span>
          <span class="vh-inv-val">{verdict.invalidation}</span>
        </div>
      {/if}
    </div>
  {/if}
  <!-- Symbol + timeframe live in the chart header; the right panel only
       hosts contextual actions (W-0102 audit: remove .panel-symbol-line). -->
  <div class="panel-header panel-header-actions-only">
    <div class="panel-actions">
      <button type="button" class:active={isPinned} onclick={() => onPinToggle?.()}>{isPinned ? 'Pinned' : 'Pin'}</button>
      <button type="button" class:active={hasSavedAlert} onclick={() => onAlertToggle?.()}>{hasSavedAlert ? 'Alert Saved' : 'Alert+'}</button>
    </div>
  </div>

  <div class="panel-tabs">
    {#each TABS as t}
      <button class="tab-btn" class:active={activeTab === t.id} onclick={() => onTabChange?.(t.id)}>
        {t.label}
      </button>
    {/each}
  </div>

  <div class="panel-body">
    {#if activeTab === 'summary'}
      {#if isEngineDegraded}
        <!-- Engine degraded / failed state -->
        <div class="degraded-card">
          <div class="degraded-row">
            <span class="degraded-icon">⚠</span>
            <span class="degraded-msg">Engine analysis unavailable</span>
          </div>
          <p class="degraded-hint">Backend engines did not return data for this asset. Check connection or retry.</p>
          {#if onRetry}
            <button class="retry-btn" onclick={() => onRetry?.()}>
              ↺ Retry Analysis
            </button>
          {/if}
        </div>
        <div class="divider"></div>
      {/if}
      {#if deepVerdict}
        <!-- Deep Score (primary) -->
        <div class="ml-score-row">
          <span class="ml-label">DEEP SCORE</span>
          <strong class="ml-value" style="color:{deepScoreColor(deepScore)}">{deepScore > 0 ? '+' : ''}{deepScore}</strong>
          <span class="deep-verdict-badge" class:bull={deepScore>=30} class:bear={deepScore<=-30}>{deepVerdict}</span>
        </div>
        {#if pWin != null}
          <div class="ml-score-row secondary">
            <span class="ml-label">ML P(win)</span>
            <strong class="ml-value-sm" style="color:{pWinColor(pWin)}">{(pWin * 100).toFixed(1)}%</strong>
            {#if ensembleTriggered}<span class="ml-ensemble-badge">⬥ ENS</span>{/if}
          </div>
        {/if}
        <div class="divider"></div>
      {:else if pWin != null}
        <!-- ML Score only (deep unavailable) -->
        <div class="ml-score-row">
          <span class="ml-label">ML P(win)</span>
          <strong class="ml-value" style="color:{pWinColor(pWin)}">{(pWin * 100).toFixed(1)}%</strong>
          {#if ensembleTriggered}<span class="ml-ensemble-badge">⬥ ENSEMBLE</span>{/if}
        </div>
        {#if blocksPositive.length > 0}
          <div class="ml-chips">
            {#each blocksPositive as b}
              <span class="ml-chip">{b.replace(/_/g, ' ')}</span>
            {/each}
          </div>
        {/if}
        <div class="divider"></div>
      {/if}
      {#if verdict}
        <VerdictHeader {verdict} />
        {#if structureExplainModel}
          <div class="divider"></div>
          <StructureExplainViz model={structureExplainModel} />
        {/if}
        <div class="divider"></div>
        <ActionStrip action={verdict.action} avoid={verdict.against[0]} />
        {#if panelModel.summaryBullets.length > 0}
          <div class="divider"></div>
          <p class="section-label">Why now</p>
          <div class="flow-list">
            {#each panelModel.summaryBullets as bullet}
              <div class="flow-row" data-state="neutral">
                <span>Signal</span>
                <strong>•</strong>
                <small>{bullet}</small>
              </div>
            {/each}
          </div>
        {/if}
        {#if summaryEvidence.length > 0}
          <div class="divider"></div>
          <p class="section-label">Key evidence</p>
          <div class="flow-list">
            {#each summaryEvidence as item}
              <div class="flow-row" data-state={item.state === 'bullish' ? 'bullish' : item.state === 'bearish' ? 'bearish' : item.state === 'warning' ? 'warning' : 'neutral'}>
                <span>{item.metric}</span>
                <strong>{item.value}</strong>
                <small>{item.interpretation}</small>
              </div>
            {/each}
          </div>
        {/if}
        <div class="divider"></div>
        <WhyPanel why={verdict.reason} against={verdict.against} />
        {#if patternRecallMatches.length > 0}
          <div class="divider"></div>
          <p class="section-label">Pattern Recall</p>
          <div class="recall-list">
            {#each patternRecallMatches.slice(0, 3) as recall}
              <div class="recall-row" data-tone={toneFromRecallScore(recall.score)}>
                <span>{recall.symbol.replace('USDT','')} {recall.timeframe.toUpperCase()}</span>
                <strong>{Math.round(recall.score * 100)}%</strong>
                <small>{recall.triggerOrigin}</small>
              </div>
            {/each}
          </div>
        {/if}
        <div class="divider"></div>
        <p class="section-label">Evidence sources · {SOURCES.length} cited</p>
        <SourceRow sources={SOURCES} />
      {:else}
        <div class="empty-panel">
          {#if analysisData}
            <!-- analysisData exists but no verdict — engine returned partial data -->
            <p class="empty-warn">⚠ Partial data</p>
            <p>Engine returned incomplete analysis.</p>
            {#if onRetry}
              <button class="retry-btn" onclick={() => onRetry?.()}>↺ Retry</button>
            {/if}
          {:else}
            <p>Select an asset or run a query to see analysis.</p>
          {/if}
        </div>
      {/if}

    {:else if activeTab === 'entry'}
      {#if analysisData}
        <div class="entry-section">
          <p class="section-label">Entry levels</p>
          <div class="entry-grid">
            <div class="entry-cell"><span>Entry</span><strong class="tp">{formatPanelPrice(panelModel.entry.entry)}</strong></div>
            <div class="entry-cell"><span>Stop</span><strong class="stop">{formatPanelPrice(panelModel.entry.stop)}</strong></div>
            <div class="entry-cell"><span>TP1</span><strong class="tp">{formatPanelPrice(panelModel.entry.tp1)}</strong></div>
            <div class="entry-cell"><span>TP2</span><strong class="tp">{formatPanelPrice(panelModel.entry.tp2)}</strong></div>
          </div>
          <div class="rr-card">
            <div class="rr-head">
              <span>Risk : Reward</span>
              <strong>1 : {panelModel.entry.rr ? panelModel.entry.rr.toFixed(1) : '—'}</strong>
            </div>
            <div class="rr-bar">
              <span class="rr-risk" style={`width:${panelModel.entry.rr ? Math.min(45, 100 / (panelModel.entry.rr + 1)) : 25}%`}></span>
              <span class="rr-reward" style={`left:${panelModel.entry.rr ? Math.min(45, 100 / (panelModel.entry.rr + 1)) + 2 : 27}%;width:${panelModel.entry.rr ? Math.max(20, 96 - Math.min(45, 100 / (panelModel.entry.rr + 1))) : 69}%`}></span>
            </div>
          </div>
          <div class="level-stack">
            {#each panelModel.entry.levels as level}
              <div class="level-row" data-tone={level.tone === 'bull' ? 'good' : level.tone === 'bear' ? 'bad' : level.tone === 'info' ? 'info' : 'neutral'}>
                <span class="level-dot"></span>
                <span class="level-label">{level.label}</span>
                <strong>{formatPanelPrice(level.value)}</strong>
                <small>{formatDistance(level.distancePct)}</small>
              </div>
            {/each}
          </div>
          <div class="prob-row">
            <span>P(win)</span>
            <div class="prob-track"><span style={`width:${Math.max(5, Math.min(95, panelModel.entry.confidencePct))}%`}></span></div>
            <strong>{panelModel.entry.confidencePct.toFixed(0)}%</strong>
          </div>
          <div class="panel-action-row">
            <button type="button" class="panel-primary" onclick={() => requestBackendAction('entry')}>Review Entry</button>
          </div>
          <p class="section-label">Venue</p>
          <p class="text-val">Binance Perp · Spot · Market engine recent</p>
          <SourceRow sources={SOURCES.slice(0, 2)} />
        </div>
      {:else}
        <div class="empty-panel"><p>Run analysis to see entry plan.</p></div>
      {/if}

    {:else if activeTab === 'risk'}
      {#if verdict}
        <div class="risk-section">
          <p class="section-label">Action plan</p>
          <div class="action-block">
            {#each panelModel.riskRows as row}
              <div class="action-line" data-tone={row.tone === 'bull' ? 'good' : row.tone === 'bear' ? 'bad' : row.tone}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            {/each}
          </div>
          {#if verdict.against.length > 0}
          <p class="section-label">Risk factors</p>
          <ul class="risk-list">
            {#each verdict.against as r}
              <li class="risk-item">⚠ {r}</li>
            {/each}
          </ul>
          {/if}
          {#if analysisData?.ensemble?.block_analysis?.disqualifiers?.length}
            <p class="section-label">Disqualifiers Active</p>
            <ul class="risk-list">
              {#each analysisData.ensemble.block_analysis.disqualifiers as d}
                <li class="risk-item danger">✗ {d}</li>
              {/each}
            </ul>
          {/if}
          <div class="panel-action-row">
            <button type="button" class="panel-primary" onclick={() => requestBackendAction('risk')}>Review Risk</button>
            <button type="button" onclick={() => requestBackendAction('alert')}>Draft Alert</button>
          </div>
        </div>
      {:else}
        <div class="empty-panel"><p>No risk flags detected.</p></div>
      {/if}

    {:else if activeTab === 'catalysts'}
      {#if newsData?.records?.length}
        <div class="news-list">
          {#each newsData.records.slice(0, 10) as item}
            <div class="news-item">
              <span class="news-time">{new Date(item.created_at || item.published_at || Date.now()).toLocaleTimeString()}</span>
              <p class="news-title">{item.title || item.text || ''}</p>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-panel"><p>No recent news.</p></div>
      {/if}

    {:else if activeTab === 'metrics'}
      {#if evidence.length}
        <div class="metrics-detail">
          <p class="section-label">Order flow · current window</p>
          <div class="flow-list">
            {#each panelModel.flowRows as item}
              <div class="flow-row" data-state={item.tone === 'bull' ? 'bullish' : item.tone === 'bear' ? 'bearish' : item.tone === 'warn' ? 'warning' : 'neutral'}>
                <span>{item.metric}</span>
                <strong>{item.value}</strong>
                <small>{item.interpretation}</small>
              </div>
            {/each}
          </div>
          <div class="prob-row">
            <span>Funding heat</span>
            <div class="prob-track amber"><span style="width:64%"></span></div>
            <strong>{fundingMetrics[0]?.value ?? '—'}</strong>
          </div>
          <div class="prob-row">
            <span>Crowding</span>
            <div class="prob-track"><span style="width:45%"></span></div>
            <strong>{oiMetrics[0]?.value ?? '—'}</strong>
          </div>
          {#if structureMetrics.length > 0}
            <div class="metrics-group">
              <p class="section-label">Structure</p>
              <EvidenceGrid evidence={structureMetrics} cols={2} {bars} {layerBarsMap} />
            </div>
          {/if}
          {#if oiMetrics.length > 0}
            <div class="metrics-group">
              <p class="section-label">Open Interest</p>
              <EvidenceGrid evidence={oiMetrics} cols={2} {bars} {layerBarsMap} />
            </div>
          {/if}
          {#if fundingMetrics.length > 0}
            <div class="metrics-group">
              <p class="section-label">Funding</p>
              <EvidenceGrid evidence={fundingMetrics} cols={2} {bars} {layerBarsMap} />
            </div>
          {/if}
        </div>
        <SourceRow sources={SOURCES} />
      {:else}
        <div class="empty-panel"><p>Run analysis to see metrics.</p></div>
      {/if}
    {/if}
  </div>

</aside>

<style>
  .context-panel {
    background: var(--sc-bg-0);
    border-left: 1px solid rgba(255,255,255,0.08);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .panel-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    background:
      linear-gradient(180deg, rgba(77,143,245,0.045), rgba(255,255,255,0.005)),
      rgba(10,13,18,0.98);
  }
  .panel-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: nowrap;
    flex-shrink: 0;
  }
  .panel-actions button {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.52);
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 3px;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .panel-actions button:hover {
    color: rgba(247,242,234,0.9);
    border-color: rgba(131,188,255,0.28);
    background: rgba(77,143,245,0.09);
  }
  .panel-actions button.active {
    color: rgba(99,179,237,0.9);
    border-color: rgba(99,179,237,0.32);
    background: rgba(77,143,245,0.10);
  }
  .panel-tabs {
    display: flex; border-bottom: 1px solid rgba(255,255,255,0.08);
    overflow-x: auto; flex-shrink: 0;
    scrollbar-width: none;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)),
      rgba(255,255,255,0.01);
  }
  .panel-tabs::-webkit-scrollbar { display: none; }
  .tab-btn {
    font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); font-weight: 600;
    color: var(--sc-text-2); background: none; border: none;
    padding: 8px 10px 7px; cursor: pointer; white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }
  .tab-btn:hover { color: var(--sc-text-1); }
  .tab-btn.active { color: var(--sc-text-0); border-bottom-color: rgba(255,255,255,0.55); }

  .panel-body {
    flex: 1; overflow-y: auto; padding: 10px;
    display: flex; flex-direction: column; gap: 8px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .divider { border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 2px 0; }
  .empty-panel { display: flex; align-items: center; justify-content: center; height: 80px; }
  .empty-panel p { font-size: 11px; color: var(--sc-text-2); text-align: center; }

  .entry-section, .risk-section, .metrics-detail { display: flex; flex-direction: column; gap: 6px; }
  .metrics-group { display: flex; flex-direction: column; gap: 5px; }
  .section-label { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--sc-text-2); margin: 0; }
  .text-val { font-size: 11px; color: var(--sc-text-1); margin: 0; }

  .entry-grid {
    display: grid;
    gap: 3px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .entry-cell,
  .level-row,
  .prob-row,
  .action-line,
  .flow-row {
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.024);
    border-radius: 3px;
  }
  .entry-cell span,
  .level-label,
  .prob-row span,
  .action-line span,
  .flow-row span {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.42);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .entry-cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px 8px;
  }
  .entry-cell strong {
    font-family: var(--sc-font-mono);
    font-size: 12px;
  }
  .rr-card {
    display: grid;
    gap: 4px;
    padding: 5px 6px;
    border: 1px solid rgba(255,255,255,0.055);
    border-radius: 2px;
    background: rgba(255,255,255,0.018);
  }
  .rr-head,
  .level-row,
  .prob-row,
  .action-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .rr-head span,
  .rr-head strong {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
  }
  .rr-head span { color: rgba(247,242,234,0.34); text-transform: uppercase; letter-spacing: 0.08em; }
  .rr-head strong { color: #8fdd9d; }
  .rr-bar {
    position: relative;
    height: 9px;
    overflow: hidden;
    border-radius: 3px;
    background: rgba(255,255,255,0.07);
  }
  .rr-risk,
  .rr-reward {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 2px;
  }
  .rr-risk { left: 0; background: #f19999; }
  .rr-reward { background: #8fdd9d; }
  .level-stack,
  .flow-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .level-row {
    padding: 5px 7px;
  }
  .level-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(247,242,234,0.32);
    flex-shrink: 0;
  }
  .level-row[data-tone='good'] .level-dot { background: #8fdd9d; }
  .level-row[data-tone='bad'] .level-dot { background: #f19999; }
  .level-row[data-tone='info'] .level-dot { background: #83bcff; }
  .level-row strong,
  .level-row small {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
  }
  .level-row strong { color: rgba(247,242,234,0.82); }
  .level-row small { color: rgba(247,242,234,0.42); min-width: 46px; text-align: right; }
  .prob-row {
    padding: 5px 7px;
  }
  .prob-track {
    flex: 1;
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: rgba(255,255,255,0.07);
  }
  .prob-track span {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: #83bcff;
  }
  .prob-track.amber span { background: #e9c167; }
  .prob-row strong {
    min-width: 44px;
    text-align: right;
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.82);
  }
  .panel-action-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }
  .panel-action-row button {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.68);
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 3px;
    padding: 6px 7px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .panel-action-row button:hover {
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.14);
    color: rgba(247,242,234,0.9);
  }
  .panel-action-row .panel-primary {
    color: #06100b;
    border-color: rgba(143,221,157,0.35);
    background: #8fdd9d;
  }
  .action-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .action-line {
    padding: 5px 7px;
    background: rgba(255,255,255,0.018);
  }
  .action-line strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.78);
  }
  .action-line[data-tone='good'] strong { color: #8fdd9d; }
  .action-line[data-tone='bad'] strong { color: #f19999; }
  .action-line[data-tone='warn'] strong { color: #e9c167; }
  .flow-row {
    display: grid;
    grid-template-columns: 70px 56px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    padding: 5px 7px;
  }
  .flow-row strong {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.82);
  }
  .flow-row small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.44);
  }
  .flow-row[data-state='bullish'] strong { color: #8fdd9d; }
  .flow-row[data-state='bearish'] strong { color: #f19999; }
  .flow-row[data-state='warning'] strong { color: #e9c167; }

  .recall-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .recall-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px 76px;
    gap: 6px;
    align-items: center;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 3px;
    background: rgba(255,255,255,0.025);
    padding: 5px 7px;
  }
  .recall-row span,
  .recall-row strong,
  .recall-row small {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
  }
  .recall-row span { color: rgba(247,242,234,0.78); }
  .recall-row strong { text-align: right; color: rgba(247,242,234,0.88); }
  .recall-row small { text-align: right; color: rgba(247,242,234,0.45); text-transform: uppercase; }
  .recall-row[data-tone='bull'] strong { color: #8fdd9d; }
  .recall-row[data-tone='info'] strong { color: #83bcff; }
  .recall-row[data-tone='warn'] strong { color: #e9c167; }

  .risk-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; }
  .risk-item { font-size: var(--ui-text-xs); color: #fbbf24; padding: 5px 7px; background: rgba(251,191,36,0.07); border-radius: 3px; }
  .risk-item.danger { color: #f87171; background: rgba(248,113,113,0.07); }

  /* ML Score */
  .ml-score-row { display: flex; align-items: baseline; gap: 6px; }
  .ml-label { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: rgba(247,242,234,0.52); }
  .ml-value { font-family: var(--sc-font-mono); font-size: 22px; font-weight: 700; line-height: 1; }
  .ml-ensemble-badge {
    font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); font-weight: 800;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--sc-good, #adca7c);
    padding: 1px 5px; border-radius: 2px;
    background: rgba(173,202,124,0.12); border: 1px solid rgba(173,202,124,0.28);
    animation: ensemblePulse 2s ease-in-out infinite;
  }
  .ml-chips { display: flex; flex-wrap: wrap; gap: 2px; }
  .ml-chip {
    font-family: var(--sc-font-mono); font-size: var(--ui-text-xs);
    padding: 1px 5px; border-radius: 2px;
    background: rgba(173,202,124,0.10); color: rgba(173,202,124,0.88);
    border: 1px solid rgba(173,202,124,0.18);
  }
  @keyframes ensemblePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.65; } }

  .deep-verdict-badge {
    font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); font-weight: 800;
    letter-spacing: 0.10em; text-transform: uppercase;
    color: rgba(247,242,234,0.7);
    padding: 1px 5px; border-radius: 2px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  }
  .deep-verdict-badge.bull { color: var(--sc-good, #adca7c); background: rgba(173,202,124,0.10); border-color: rgba(173,202,124,0.28); }
  .deep-verdict-badge.bear { color: var(--sc-bad, #cf7f8f); background: rgba(207,127,143,0.10); border-color: rgba(207,127,143,0.28); }
  .ml-score-row.secondary { margin-top: -6px; }
  .ml-value-sm { font-family: var(--sc-font-mono); font-size: 15px; font-weight: 600; line-height: 1; }

  /* Engine degraded card */
  .degraded-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 9px;
    border: 1px solid rgba(251, 191, 36, 0.22);
    border-radius: 5px;
    background: rgba(251, 191, 36, 0.04);
  }
  .degraded-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .degraded-icon {
    font-size: 13px;
    color: #fbbf24;
    flex-shrink: 0;
  }
  .degraded-msg {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    color: rgba(251, 191, 36, 0.88);
    letter-spacing: 0.04em;
  }
  .degraded-hint {
    margin: 0;
    font-size: var(--ui-text-xs);
    line-height: 1.45;
    color: rgba(247, 242, 234, 0.42);
  }
  .retry-btn {
    align-self: flex-start;
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(247, 242, 234, 0.82);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 3px;
    padding: 4px 9px;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .retry-btn:hover {
    background: rgba(77, 143, 245, 0.12);
    border-color: rgba(99, 179, 237, 0.3);
    color: rgba(247, 242, 234, 1);
  }
  .empty-warn {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    color: #fbbf24;
    margin: 0;
  }

  /* Verdict hero — top of panel, always visible */
  .verdict-hero {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 12px 10px;
    background: rgba(255,255,255,0.02);
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .verdict-hero.bull {
    background: linear-gradient(135deg, rgba(34,171,148,0.09), rgba(34,171,148,0.04));
    border-bottom-color: rgba(34,171,148,0.20);
  }
  .verdict-hero.bear {
    background: linear-gradient(135deg, rgba(242,54,69,0.09), rgba(242,54,69,0.04));
    border-bottom-color: rgba(242,54,69,0.20);
  }
  .vh-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .vh-dir {
    font-family: var(--sc-font-mono);
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: rgba(209,212,220,0.72);
    flex-shrink: 0;
    line-height: 1;
  }
  .verdict-hero.bull .vh-dir { color: var(--tv-green, #22AB94); }
  .verdict-hero.bear .vh-dir { color: var(--tv-red, #F23645); }
  .vh-action {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(209,212,220,0.62);
    flex: 1;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vh-inv {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .vh-inv-label {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(209,212,220,0.32);
    flex-shrink: 0;
  }
  .vh-inv-val {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: rgba(209,212,220,0.70);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stop { color: var(--sc-bad, #cf7f8f) !important; }
  .tp   { color: var(--sc-good, #adca7c) !important; }
  .news-list { display: flex; flex-direction: column; gap: 6px; }
  .news-item { display: flex; flex-direction: column; gap: 3px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .news-time { font-family: var(--sc-font-mono); font-size: var(--ui-text-xs); color: var(--sc-text-2); }
  .news-title { font-size: 11px; color: var(--sc-text-1); margin: 0; line-height: 1.3; }


</style>
