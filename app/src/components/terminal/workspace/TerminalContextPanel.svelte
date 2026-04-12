<script lang="ts">
  import type { TerminalVerdict, TerminalEvidence, TerminalSource } from '$lib/types/terminal';
  import VerdictHeader from './VerdictHeader.svelte';
  import ActionStrip from './ActionStrip.svelte';
  import EvidenceGrid from './EvidenceGrid.svelte';
  import WhyPanel from './WhyPanel.svelte';
  import SourceRow from './SourceRow.svelte';

  interface Props {
    analysisData?: any;
    newsData?: any;
    activeTab?: string;
    onTabChange?: (t: string) => void;
  }
  let { analysisData, newsData, activeTab = 'summary', onTabChange }: Props = $props();

  const TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'entry', label: 'Entry' },
    { id: 'risk', label: 'Risk' },
    { id: 'catalysts', label: 'News' },
    { id: 'metrics', label: 'Metrics' },
  ];

  // ML score fields
  const pWin: number | null = $derived(analysisData?.p_win ?? null);
  const blocksTriggered: string[] = $derived(analysisData?.blocks_triggered ?? []);
  const ensembleTriggered: boolean = $derived(analysisData?.ensemble_triggered ?? false);
  const DISQUALIFIERS = new Set(['volume_below_average', 'extreme_volatility', 'extended_from_ma']);
  const blocksPositive = $derived(blocksTriggered.filter((b: string) => !DISQUALIFIERS.has(b)));

  function pWinColor(p: number | null): string {
    if (p == null) return 'rgba(247,242,234,0.4)';
    if (p >= 0.60) return 'var(--sc-good, #adca7c)';
    if (p >= 0.55) return 'rgba(173,202,124,0.72)';
    if (p <= 0.45) return 'var(--sc-bad, #cf7f8f)';
    return 'rgba(247,242,234,0.72)';
  }

  // Derive verdict from analysisData
  let verdict = $derived(analysisData?.ensemble ? {
    direction: (analysisData.ensemble.direction.includes('long') ? 'bullish' :
                analysisData.ensemble.direction.includes('short') ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
    confidence: (Math.abs(analysisData.ensemble.ensemble_score) > 0.6 ? 'high' :
                 Math.abs(analysisData.ensemble.ensemble_score) > 0.3 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
    reason: analysisData.ensemble.reason || 'Analysis in progress',
    against: analysisData.ensemble.block_analysis?.disqualifiers || [],
    action: analysisData.ensemble.direction === 'strong_long' ? 'Strong buy on pullback' :
            analysisData.ensemble.direction === 'long' ? 'Buy on pullback' :
            analysisData.ensemble.direction === 'short' ? 'Avoid / short' : 'Wait for clarity',
    invalidation: '',
    updatedAt: Date.now(),
  } : null);

  // Derive evidence from snapshot
  let evidence = $derived((() => {
    if (!analysisData?.snapshot) return [];
    const s = analysisData.snapshot;
    const ev: TerminalEvidence[] = [];
    if (s.rsi14 != null) ev.push({
      metric: 'RSI 14', value: s.rsi14.toFixed(1), delta: '',
      interpretation: s.rsi14 > 70 ? 'Overbought' : s.rsi14 < 30 ? 'Oversold' : 'Neutral',
      state: s.rsi14 > 70 ? 'warning' : s.rsi14 < 30 ? 'bullish' : 'neutral',
      sourceCount: 1,
    });
    if (s.funding_rate != null) ev.push({
      metric: 'Funding', value: (s.funding_rate * 100).toFixed(3) + '%', delta: '',
      interpretation: s.funding_rate > 0.01 ? 'Longs paying' : s.funding_rate < -0.005 ? 'Shorts paying' : 'Neutral',
      state: s.funding_rate > 0.015 ? 'warning' : 'neutral',
      sourceCount: 1,
    });
    if (s.oi_change_1h != null) ev.push({
      metric: 'OI 1H', value: (s.oi_change_1h >= 0 ? '+' : '') + (s.oi_change_1h * 100).toFixed(2) + '%', delta: '',
      interpretation: s.oi_change_1h > 0.02 ? 'Expanding' : s.oi_change_1h < -0.02 ? 'Contracting' : 'Stable',
      state: s.oi_change_1h > 0.02 ? 'bullish' : s.oi_change_1h < -0.02 ? 'bearish' : 'neutral',
      sourceCount: 1,
    });
    if (s.cvd_state) ev.push({
      metric: 'CVD', value: s.cvd_state, delta: '',
      interpretation: s.cvd_state === 'buying' ? 'Aggressive buys' : s.cvd_state === 'selling' ? 'Aggressive sells' : 'Balanced',
      state: s.cvd_state === 'buying' ? 'bullish' : s.cvd_state === 'selling' ? 'bearish' : 'neutral',
      sourceCount: 1,
    });
    if (s.regime) ev.push({
      metric: 'Regime', value: s.regime.toUpperCase(), delta: '',
      interpretation: s.regime,
      state: s.regime === 'risk_on' ? 'bullish' : s.regime === 'risk_off' ? 'bearish' : 'neutral',
      sourceCount: 1,
    });
    if (s.vol_ratio_3 != null) ev.push({
      metric: 'Volume', value: s.vol_ratio_3.toFixed(1) + 'x', delta: '',
      interpretation: s.vol_ratio_3 > 2 ? 'Spike' : s.vol_ratio_3 > 1.2 ? 'Above avg' : 'Below avg',
      state: s.vol_ratio_3 > 2 ? 'warning' : 'neutral',
      sourceCount: 1,
    });
    return ev;
  })());

  const SOURCES: TerminalSource[] = [
    { label: 'Binance Spot', category: 'Market', freshness: 'live', updatedAt: Date.now() },
    { label: 'Binance Perp', category: 'Market', freshness: 'recent', updatedAt: Date.now() - 15000 },
    { label: 'Internal Model', category: 'Model', freshness: 'recent', updatedAt: Date.now() - 30000, method: 'Feature calc + ensemble' },
  ];
</script>

<aside class="context-panel">
  <div class="panel-tabs">
    {#each TABS as t}
      <button class="tab-btn" class:active={activeTab === t.id} onclick={() => onTabChange?.(t.id)}>
        {t.label}
      </button>
    {/each}
  </div>

  <div class="panel-body">
    {#if activeTab === 'summary'}
      {#if pWin != null}
        <div class="ml-score-row">
          <span class="ml-label">ML P(win)</span>
          <strong class="ml-value" style="color:{pWinColor(pWin)}">{(pWin * 100).toFixed(1)}%</strong>
          {#if ensembleTriggered}
            <span class="ml-ensemble-badge">⬥ ENSEMBLE</span>
          {/if}
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
        <div class="divider"></div>
        <EvidenceGrid {evidence} cols={2} />
        <div class="divider"></div>
        <WhyPanel why={verdict.reason} against={verdict.against} />
        <div class="divider"></div>
        <SourceRow sources={SOURCES} />
      {:else}
        <div class="empty-panel">
          <p>Select an asset or run a query to see analysis.</p>
        </div>
      {/if}

    {:else if activeTab === 'entry'}
      {#if analysisData}
        <div class="entry-section">
          <p class="section-label">Entry Zone</p>
          <p class="mono-val">Near VWAP or support</p>
          <p class="section-label">Stop / Invalidation</p>
          <p class="mono-val">Below swing low</p>
          <p class="section-label">Venue</p>
          <p class="text-val">Binance Perp · Spot</p>
          <SourceRow sources={SOURCES.slice(0, 2)} />
        </div>
      {:else}
        <div class="empty-panel"><p>Run analysis to see entry plan.</p></div>
      {/if}

    {:else if activeTab === 'risk'}
      {#if verdict && verdict.against.length > 0}
        <div class="risk-section">
          <p class="section-label">Risk Factors</p>
          <ul class="risk-list">
            {#each verdict.against as r}
              <li class="risk-item">⚠ {r}</li>
            {/each}
          </ul>
          {#if analysisData?.ensemble?.block_analysis?.disqualifiers?.length}
            <p class="section-label">Disqualifiers Active</p>
            <ul class="risk-list">
              {#each analysisData.ensemble.block_analysis.disqualifiers as d}
                <li class="risk-item danger">✗ {d}</li>
              {/each}
            </ul>
          {/if}
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
          {#each evidence as ev}
            <div class="metric-row">
              <span class="metric-label">{ev.metric}</span>
              <span class="metric-val" style="color:{ev.state==='bullish'?'#4ade80':ev.state==='bearish'?'#f87171':ev.state==='warning'?'#fbbf24':'var(--sc-text-1)'}">
                {ev.value}
              </span>
              <span class="metric-interp">{ev.interpretation}</span>
            </div>
          {/each}
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
  .panel-tabs {
    display: flex; border-bottom: 1px solid rgba(255,255,255,0.08);
    overflow-x: auto; flex-shrink: 0;
  }
  .tab-btn {
    font-family: var(--sc-font-mono); font-size: 11px; font-weight: 600;
    color: var(--sc-text-2); background: none; border: none;
    padding: 10px 14px; cursor: pointer; white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .tab-btn:hover { color: var(--sc-text-1); }
  .tab-btn.active { color: var(--sc-text-0); border-bottom-color: rgba(255,255,255,0.5); }

  .panel-body {
    flex: 1; overflow-y: auto; padding: 14px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .divider { border: none; border-top: 1px solid rgba(255,255,255,0.06); }
  .empty-panel { display: flex; align-items: center; justify-content: center; height: 120px; }
  .empty-panel p { font-size: 12px; color: var(--sc-text-2); text-align: center; }

  .entry-section, .risk-section, .metrics-detail { display: flex; flex-direction: column; gap: 8px; }
  .section-label { font-family: var(--sc-font-mono); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sc-text-2); margin: 0; }
  .mono-val { font-family: var(--sc-font-mono); font-size: 12px; color: var(--sc-text-0); margin: 0; }
  .text-val { font-size: 12px; color: var(--sc-text-1); margin: 0; }

  .risk-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
  .risk-item { font-size: 11px; color: #fbbf24; padding: 4px 8px; background: rgba(251,191,36,0.06); border-radius: 3px; }
  .risk-item.danger { color: #f87171; background: rgba(248,113,113,0.06); }

  /* ML Score */
  .ml-score-row { display: flex; align-items: baseline; gap: 8px; }
  .ml-label { font-family: var(--sc-font-mono); font-size: 10px; color: rgba(247,242,234,0.5); }
  .ml-value { font-family: var(--sc-font-mono); font-size: 20px; font-weight: 700; line-height: 1; }
  .ml-ensemble-badge {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 800;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--sc-good, #adca7c);
    padding: 2px 7px; border-radius: 999px;
    background: rgba(173,202,124,0.12); border: 1px solid rgba(173,202,124,0.28);
    animation: ensemblePulse 2s ease-in-out infinite;
  }
  .ml-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .ml-chip {
    font-family: var(--sc-font-mono); font-size: 9px;
    padding: 2px 7px; border-radius: 999px;
    background: rgba(173,202,124,0.10); color: rgba(173,202,124,0.88);
    border: 1px solid rgba(173,202,124,0.18);
  }
  @keyframes ensemblePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.65; } }

  .news-list { display: flex; flex-direction: column; gap: 8px; }
  .news-item { display: flex; flex-direction: column; gap: 3px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .news-time { font-family: var(--sc-font-mono); font-size: 10px; color: var(--sc-text-2); }
  .news-title { font-size: 12px; color: var(--sc-text-1); margin: 0; line-height: 1.4; }

  .metric-row { display: grid; grid-template-columns: 80px 80px 1fr; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .metric-label { font-family: var(--sc-font-mono); font-size: 10px; color: var(--sc-text-2); text-transform: uppercase; }
  .metric-val { font-family: var(--sc-font-mono); font-size: 12px; font-weight: 700; }
  .metric-interp { font-size: 11px; color: var(--sc-text-2); }
</style>
