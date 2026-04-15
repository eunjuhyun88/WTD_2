<script lang="ts">
  import type { TerminalEvidence } from '$lib/types/terminal';
  import type { DerivativesEnvelope, SnapshotEnvelope } from '$lib/contracts/terminalBackend';
  import type { StatusStripItem } from '$lib/terminal/terminalDerived';
  import VerdictHeader from './VerdictHeader.svelte';
  import ActionStrip from './ActionStrip.svelte';
  import EvidenceGrid from './EvidenceGrid.svelte';
  import WhyPanel from './WhyPanel.svelte';
  import SourceRow from './SourceRow.svelte';
  import {
    buildEvidenceFromAnalysis,
    buildPanelModel,
    buildSourcesFromAnalysis,
    buildVerdictFromAnalysis,
    type PanelAnalyzeData,
  } from '$lib/terminal/panelAdapter';

  interface Props {
    analysisData?: PanelAnalyzeData | null;
    newsData?: any;
    activeTab?: string;
    onTabChange?: (t: string) => void;
    onAction?: (text: string) => void;
    onCapture?: () => void;
    onPinToggle?: () => void;
    onCompare?: () => void;
    onAlertToggle?: () => void;
    bars?: any[];
    statusItems?: StatusStripItem[];
    tabOrder?: string[];
    layerBarsMap?: Record<string, any[]>;
    isPinned?: boolean;
    hasSavedAlert?: boolean;
  }
  let {
    analysisData,
    newsData,
    activeTab = 'summary',
    onTabChange,
    onAction,
    onCapture,
    onPinToggle,
    onCompare,
    onAlertToggle,
    bars = [],
    statusItems = [],
    tabOrder = [],
    layerBarsMap = {},
    isPinned = false,
    hasSavedAlert = false,
  }: Props = $props();
  let pinned = $state(false);

  const TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'entry', label: 'Entry' },
    { id: 'risk', label: 'Risk' },
    { id: 'metrics', label: 'Flow' },
    { id: 'catalysts', label: 'News' },
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

  function formatPanelChange(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }

  const panelSymbol = $derived(
    String(analysisData?.symbol ?? analysisData?.snapshot?.symbol ?? 'BTCUSDT').replace('USDT', '')
  );
  const panelPrice = $derived(
    analysisData?.price ?? analysisData?.snapshot?.last_close ?? null
  );
  const panelChange = $derived(
    analysisData?.change24h
      ?? analysisData?.snapshot?.change24h
      ?? analysisData?.snapshot?.price_change_pct_24h
      ?? null
  );
  const panelTimeframe = $derived(String(analysisData?.snapshot?.timeframe ?? analysisData?.timeframe ?? '4h').toUpperCase());
  const mtfCells = $derived.by(() => {
    const direction = verdict?.direction ?? 'neutral';
    const labels = ['5m', '15m', '1H', '4H'];
    return labels.map((label, index) => {
      let tone: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (direction === 'bullish' && index < 3) tone = 'bullish';
      if (direction === 'bearish' && index < 3) tone = 'bearish';
      return {
        label,
        tone,
        value: tone === 'bullish' ? '↑ Bull' : tone === 'bearish' ? '↓ Bear' : '→ Flat',
      };
    });
  });
  function formatDistance(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }

  function requestBackendAction(kind: 'compare' | 'alert' | 'entry' | 'risk') {
    const symbol = `${panelSymbol}USDT`;
    const prompts = {
      compare: `Compare ${symbol} against ETHUSDT and SOLUSDT using backend terminal evidence. Return verdict, action, evidence, and sources.`,
      alert: `Draft backend scanner alert conditions for ${symbol} on ${panelTimeframe}. Include trigger, confirmation, disqualifiers, and invalidation.`,
      entry: `Review the entry plan for ${symbol} on ${panelTimeframe} using current backend analysis. Do not execute trades; return entry, stop, targets, risk, and evidence.`,
      risk: `Run a risk check for ${symbol} on ${panelTimeframe}. Return crowding, liquidity, invalidation, avoid actions, and sources.`,
    } satisfies Record<typeof kind, string>;
    onAction?.(prompts[kind]);
  }

  function openChartView() {
    onAction?.(`Open chart-focused view for ${panelSymbol}USDT on ${panelTimeframe} and summarize key levels.`);
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
  const compactStatusItems = $derived(statusItems.filter((item) => item.label !== 'Board').slice(0, 5));
  const rankedTabs = $derived.by(() => {
    if (!tabOrder.length) return TABS;
    const priority = new Map(tabOrder.map((id, index) => [id, index]));
    return [...TABS].sort((a, b) => (priority.get(a.id) ?? 99) - (priority.get(b.id) ?? 99));
  });
</script>

<aside class="context-panel">
  <div class="panel-header">
    <div class="panel-symbol-line">
      <span class="panel-symbol">{panelSymbol}/USDT</span>
      <span class="panel-context">Terminal Analysis</span>
      <span class="panel-bias" data-bias={verdict?.direction ?? 'neutral'}>{panelModel.header.biasLabel}</span>
    </div>
    <div class="panel-price-line">
      <strong>{panelModel.header.priceLabel}</strong>
      <span class="panel-change" data-tone={panelModel.header.changeTone}>
        {panelModel.header.changeLabel}
      </span>
      <small>Sources {panelModel.header.sourceCount}</small>
    </div>
  <div class="panel-actions">
    <button
      type="button"
      class:active={isPinned || pinned}
      onclick={() => {
        if (onPinToggle) {
          onPinToggle();
          return;
        }
        pinned = !pinned;
      }}
    >{isPinned || pinned ? 'Pinned' : 'Pin'}</button>
    <button type="button" onclick={() => (onCompare ? onCompare() : requestBackendAction('compare'))}>Compare</button>
    <button type="button" onclick={openChartView}>Chart</button>
    <button
      type="button"
      class:active={hasSavedAlert}
      onclick={() => (onAlertToggle ? onAlertToggle() : requestBackendAction('alert'))}
    >{hasSavedAlert ? 'Alert Saved' : 'Alert+'}</button>
  </div>
  {#if compactStatusItems.length > 0}
    <div class="panel-status-strip">
      {#each compactStatusItems as item}
        <span class="panel-status-pill" data-tone={item.tone}>
          <em>{item.label}</em>
          <strong>{item.value}</strong>
        </span>
      {/each}
    </div>
  {/if}
</div>

  <div class="panel-tabs">
    {#each rankedTabs as t}
      <button class="tab-btn" class:active={activeTab === t.id} onclick={() => onTabChange?.(t.id)}>
        {t.label}
      </button>
    {/each}
  </div>

  <div class="panel-body">
    {#if activeTab === 'summary'}
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
        <div class="divider"></div>
        <EvidenceGrid {evidence} cols={2} {bars} {layerBarsMap} />
        <div class="divider"></div>
        <WhyPanel why={verdict.reason} against={verdict.against} />
        <div class="divider"></div>
        <p class="section-label">Multi-timeframe alignment</p>
        <div class="mtf-row">
          {#each mtfCells as cell}
            <button type="button" class="mtf-cell" data-tone={cell.tone}>
              <span>{cell.label}</span>
              <strong>{cell.value}</strong>
            </button>
          {/each}
        </div>
        <div class="divider"></div>
        <p class="section-label">Evidence sources · {SOURCES.length} cited</p>
        <div class="source-grid">
          {#each SOURCES as source}
            <button type="button" class="source-grid-item" data-category={source.category}>
              <span>{source.label}</span>
              <small>{source.freshness}</small>
            </button>
          {/each}
        </div>
        <SourceRow sources={SOURCES} />
      {:else}
        <div class="empty-panel">
          <p>Select an asset or run a query to see analysis.</p>
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
            <button type="button" onclick={() => onCapture?.()}>Save Challenge</button>
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

  <div class="panel-conclusion">
    <div class="conclusion-row">
      <span class="conclusion-label">Bias</span>
      <span class="conclusion-value">{panelConclusion.bias}</span>
    </div>
    <div class="conclusion-row">
      <span class="conclusion-label">Action</span>
      <span class="conclusion-value">{panelConclusion.action}</span>
    </div>
    <div class="conclusion-row">
      <span class="conclusion-label">Invalidation</span>
      <span class="conclusion-value">{panelConclusion.invalidation}</span>
    </div>
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
    display: grid;
    gap: 3px;
    padding: 4px 5px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    background:
      linear-gradient(180deg, rgba(77,143,245,0.045), rgba(255,255,255,0.005)),
      rgba(10,13,18,0.98);
  }
  .panel-symbol-line,
  .panel-price-line,
  .panel-actions {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .panel-symbol-line {
    gap: 4px;
  }
  .panel-symbol {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.03em;
    color: rgba(247,242,234,0.92);
    white-space: nowrap;
  }
  .panel-context {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--sc-font-mono);
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.34);
  }
  .panel-bias {
    margin-left: auto;
    flex-shrink: 0;
    font-family: var(--sc-font-mono);
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(247,242,234,0.52);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 2px;
    padding: 1px 4px;
    background: rgba(255,255,255,0.035);
  }
  .panel-bias[data-bias='bullish'] {
    color: #8fdd9d;
    border-color: rgba(143,221,157,0.22);
    background: rgba(143,221,157,0.07);
  }
  .panel-bias[data-bias='bearish'] {
    color: #f19999;
    border-color: rgba(241,153,153,0.22);
    background: rgba(241,153,153,0.07);
  }
  .panel-price-line {
    gap: 5px;
    align-items: baseline;
  }
  .panel-price-line strong {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    line-height: 1;
    color: rgba(247,242,234,0.9);
  }
  .panel-change {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: rgba(247,242,234,0.45);
  }
  .panel-change[data-tone='bull'] { color: #8fdd9d; }
  .panel-change[data-tone='bear'] { color: #f19999; }
  .panel-price-line small {
    margin-left: auto;
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: rgba(247,242,234,0.28);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .panel-actions {
    gap: 2px;
  }
  .panel-actions button {
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: rgba(247,242,234,0.48);
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.075);
    border-radius: 2px;
    padding: 2px 5px;
    cursor: pointer;
  }
  .panel-actions button:hover {
    color: rgba(247,242,234,0.85);
    border-color: rgba(131,188,255,0.22);
    background: rgba(77,143,245,0.07);
  }
  .panel-status-strip {
    display: flex;
    align-items: center;
    gap: 3px;
    overflow-x: auto;
    scrollbar-width: none;
    padding-top: 1px;
  }
  .panel-status-strip::-webkit-scrollbar {
    display: none;
  }
  .panel-status-pill {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 5px;
    border-radius: 2px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.03);
  }
  .panel-status-pill em,
  .panel-status-pill strong {
    font-family: var(--sc-font-mono);
    font-style: normal;
  }
  .panel-status-pill em {
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(247,242,234,0.38);
  }
  .panel-status-pill strong {
    font-size: 8px;
    color: rgba(247,242,234,0.82);
  }
  .panel-status-pill[data-tone='bull'] strong { color: #8fdd9d; }
  .panel-status-pill[data-tone='bear'] strong { color: #f19999; }
  .panel-status-pill[data-tone='warn'] strong { color: #e9c167; }
  .panel-status-pill[data-tone='info'] strong { color: #83bcff; }
  .panel-tabs {
    display: flex; border-bottom: 1px solid rgba(255,255,255,0.08);
    overflow-x: auto; flex-shrink: 0;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)),
      rgba(255,255,255,0.01);
  }
  .tab-btn {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 600;
    color: var(--sc-text-2); background: none; border: none;
    padding: 5px 6px 4px; cursor: pointer; white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .tab-btn:hover { color: var(--sc-text-1); }
  .tab-btn.active { color: var(--sc-text-0); border-bottom-color: rgba(255,255,255,0.5); }

  .panel-body {
    flex: 1; overflow-y: auto; padding: 5px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .divider { border: none; border-top: 1px solid rgba(255,255,255,0.06); }
  .empty-panel { display: flex; align-items: center; justify-content: center; height: 80px; }
  .empty-panel p { font-size: 10px; color: var(--sc-text-2); text-align: center; }

  .entry-section, .risk-section, .metrics-detail { display: flex; flex-direction: column; gap: 5px; }
  .metrics-group { display: flex; flex-direction: column; gap: 4px; }
  .section-label { font-family: var(--sc-font-mono); font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sc-text-2); margin: 0; }
  .text-val { font-size: 10px; color: var(--sc-text-1); margin: 0; }

  .mtf-row,
  .entry-grid,
  .source-grid {
    display: grid;
    gap: 3px;
  }
  .mtf-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .entry-grid,
  .source-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mtf-cell,
  .entry-cell,
  .source-grid-item,
  .level-row,
  .prob-row,
  .action-line,
  .flow-row {
    border: 1px solid rgba(255,255,255,0.055);
    background: rgba(255,255,255,0.018);
    border-radius: 2px;
  }
  .mtf-cell,
  .source-grid-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 5px;
    text-align: left;
    cursor: pointer;
  }
  .mtf-cell span,
  .entry-cell span,
  .source-grid-item small,
  .level-label,
  .prob-row span,
  .action-line span,
  .flow-row span {
    font-family: var(--sc-font-mono);
    font-size: 7px;
    color: rgba(247,242,234,0.34);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .mtf-cell strong,
  .source-grid-item span {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    color: rgba(247,242,234,0.74);
  }
  .mtf-cell[data-tone='bullish'] strong { color: #8fdd9d; }
  .mtf-cell[data-tone='bearish'] strong { color: #f19999; }
  .mtf-cell[data-tone='neutral'] strong { color: rgba(247,242,234,0.55); }
  .source-grid-item[data-category='Market'] span { color: #83bcff; }
  .source-grid-item[data-category='Model'] span { color: #c4a4ff; }
  .source-grid-item[data-category='News'] span { color: rgba(247,242,234,0.74); }

  .entry-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px 6px;
  }
  .entry-cell strong {
    font-family: var(--sc-font-mono);
    font-size: 10px;
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
    font-size: 8px;
  }
  .rr-head span { color: rgba(247,242,234,0.34); text-transform: uppercase; letter-spacing: 0.08em; }
  .rr-head strong { color: #8fdd9d; }
  .rr-bar {
    position: relative;
    height: 7px;
    overflow: hidden;
    border-radius: 2px;
    background: rgba(255,255,255,0.055);
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
    padding: 3px 5px;
  }
  .level-dot {
    width: 5px;
    height: 5px;
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
    font-size: 8px;
  }
  .level-row strong { color: rgba(247,242,234,0.78); }
  .level-row small { color: rgba(247,242,234,0.34); min-width: 42px; text-align: right; }
  .prob-row {
    padding: 4px 5px;
  }
  .prob-track {
    flex: 1;
    height: 5px;
    overflow: hidden;
    border-radius: 2px;
    background: rgba(255,255,255,0.06);
  }
  .prob-track span {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: #83bcff;
  }
  .prob-track.amber span { background: #e9c167; }
  .prob-row strong {
    min-width: 42px;
    text-align: right;
    font-family: var(--sc-font-mono);
    font-size: 8px;
    color: rgba(247,242,234,0.76);
  }
  .panel-action-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
  }
  .panel-action-row button {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    color: rgba(247,242,234,0.6);
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.075);
    border-radius: 2px;
    padding: 4px 5px;
    cursor: pointer;
  }
  .panel-action-row .panel-primary {
    color: #06100b;
    border-color: rgba(143,221,157,0.28);
    background: #8fdd9d;
  }
  .action-block {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .action-line {
    padding: 4px 5px;
    background: rgba(255,255,255,0.015);
  }
  .action-line strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--sc-font-mono);
    font-size: 8px;
    color: rgba(247,242,234,0.72);
  }
  .action-line[data-tone='good'] strong { color: #8fdd9d; }
  .action-line[data-tone='bad'] strong { color: #f19999; }
  .action-line[data-tone='warn'] strong { color: #e9c167; }
  .flow-row {
    display: grid;
    grid-template-columns: 64px 52px minmax(0, 1fr);
    gap: 5px;
    align-items: center;
    padding: 4px 5px;
  }
  .flow-row strong {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: rgba(247,242,234,0.76);
  }
  .flow-row small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 8px;
    color: rgba(247,242,234,0.38);
  }
  .flow-row[data-state='bullish'] strong { color: #8fdd9d; }
  .flow-row[data-state='bearish'] strong { color: #f19999; }
  .flow-row[data-state='warning'] strong { color: #e9c167; }

  .risk-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
  .risk-item { font-size: 9px; color: #fbbf24; padding: 3px 5px; background: rgba(251,191,36,0.06); border-radius: 2px; }
  .risk-item.danger { color: #f87171; background: rgba(248,113,113,0.06); }

  /* ML Score */
  .ml-score-row { display: flex; align-items: baseline; gap: 5px; }
  .ml-label { font-family: var(--sc-font-mono); font-size: 8px; color: rgba(247,242,234,0.5); }
  .ml-value { font-family: var(--sc-font-mono); font-size: 16px; font-weight: 700; line-height: 1; }
  .ml-ensemble-badge {
    font-family: var(--sc-font-mono); font-size: 8px; font-weight: 800;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--sc-good, #adca7c);
    padding: 1px 5px; border-radius: 2px;
    background: rgba(173,202,124,0.12); border: 1px solid rgba(173,202,124,0.28);
    animation: ensemblePulse 2s ease-in-out infinite;
  }
  .ml-chips { display: flex; flex-wrap: wrap; gap: 2px; }
  .ml-chip {
    font-family: var(--sc-font-mono); font-size: 8px;
    padding: 1px 5px; border-radius: 2px;
    background: rgba(173,202,124,0.10); color: rgba(173,202,124,0.88);
    border: 1px solid rgba(173,202,124,0.18);
  }
  @keyframes ensemblePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.65; } }

  .deep-verdict-badge {
    font-family: var(--sc-font-mono); font-size: 8px; font-weight: 800;
    letter-spacing: 0.10em; text-transform: uppercase;
    color: rgba(247,242,234,0.7);
    padding: 1px 5px; border-radius: 2px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  }
  .deep-verdict-badge.bull { color: var(--sc-good, #adca7c); background: rgba(173,202,124,0.10); border-color: rgba(173,202,124,0.28); }
  .deep-verdict-badge.bear { color: var(--sc-bad, #cf7f8f); background: rgba(207,127,143,0.10); border-color: rgba(207,127,143,0.28); }
  .ml-score-row.secondary { margin-top: -6px; }
  .ml-value-sm { font-family: var(--sc-font-mono); font-size: 12px; font-weight: 600; line-height: 1; }

  .stop { color: var(--sc-bad, #cf7f8f) !important; }
  .tp   { color: var(--sc-good, #adca7c) !important; }
  .news-list { display: flex; flex-direction: column; gap: 4px; }
  .news-item { display: flex; flex-direction: column; gap: 2px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .news-time { font-family: var(--sc-font-mono); font-size: 8px; color: var(--sc-text-2); }
  .news-title { font-size: 10px; color: var(--sc-text-1); margin: 0; line-height: 1.25; }

  .panel-conclusion {
    flex-shrink: 0;
    display: grid;
    gap: 1px;
    padding: 6px 7px 7px;
    border-top: 1px solid rgba(255,255,255,0.08);
    background:
      linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.02)),
      rgba(5, 7, 10, 0.96);
  }

  .conclusion-row {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 5px;
    align-items: start;
  }

  .conclusion-label {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.42);
  }

  .conclusion-value {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    line-height: 1.25;
    color: rgba(247,242,234,0.82);
  }

</style>
