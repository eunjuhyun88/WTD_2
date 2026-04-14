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
    bars?: any[];
    layerBarsMap?: Record<string, any[]>;
  }
  let { analysisData, newsData, activeTab = 'summary', onTabChange, bars = [], layerBarsMap = {} }: Props = $props();

  const TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'entry', label: 'Entry' },
    { id: 'risk', label: 'Risk' },
    { id: 'catalysts', label: 'Catalysts' },
    { id: 'metrics', label: 'Metrics' },
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

  // ── Verdict — deep first, ensemble fallback ───────────────────────────
  let verdict = $derived((() => {
    if (deep?.verdict) {
      const score = deep.total_score ?? 0;
      const v: string = deep.verdict;
      const direction: 'bullish'|'bearish'|'neutral' =
        v.includes('BULL') ? 'bullish' : v.includes('BEAR') ? 'bearish' : 'neutral';
      const topLayers = deep.layers
        ? Object.entries(deep.layers as Record<string, any>)
            .filter(([, lr]) => lr.score !== 0)
            .sort(([, a], [, b]) => Math.abs(b.score) - Math.abs(a.score))
            .slice(0, 3)
            .map(([, lr]) => (lr.sigs as Array<{t:string}>)[0]?.t ?? '')
            .filter(Boolean)
            .join(' · ')
        : v;
      return {
        direction,
        confidence: (Math.abs(score) >= 50 ? 'high' : Math.abs(score) >= 20 ? 'medium' : 'low') as 'high'|'medium'|'low',
        reason: topLayers || v,
        against: analysisData?.ensemble?.block_analysis?.disqualifiers || [],
        action: v === 'STRONG BULL' ? 'Strong buy on pullback'
              : v === 'BULLISH' ? 'Buy on pullback'
              : v === 'BEARISH' ? 'Avoid / short'
              : v === 'STRONG BEAR' ? 'Strong short / avoid' : 'Wait for clarity',
        invalidation: atrLevels.stop_long
          ? `Stop $${Number(atrLevels.stop_long).toLocaleString('en-US', {maximumFractionDigits: 2})}`
          : '',
        updatedAt: Date.now(),
      };
    }
    if (!analysisData?.ensemble) return null;
    const ens = analysisData.ensemble;
    const dir = ens.direction ?? '';
    return {
      direction: (dir.includes('long') ? 'bullish' : dir.includes('short') ? 'bearish' : 'neutral') as 'bullish'|'bearish'|'neutral',
      confidence: (Math.abs(ens.ensemble_score) > 0.6 ? 'high' : Math.abs(ens.ensemble_score) > 0.3 ? 'medium' : 'low') as 'high'|'medium'|'low',
      reason: ens.reason || 'Analysis in progress',
      against: ens.block_analysis?.disqualifiers || [],
      action: dir === 'strong_long' ? 'Strong buy on pullback'
            : dir === 'long' ? 'Buy on pullback'
            : dir === 'short' ? 'Avoid / short' : 'Wait for clarity',
      invalidation: '',
      updatedAt: Date.now(),
    };
  })());

  // ── Evidence — deep.layers first, snapshot fallback ──────────────────
  const LAYER_LABELS: Record<string, string> = {
    wyckoff:'Wyckoff', mtf:'MTF Conf', breakout:'Breakout',
    vsurge:'Vol Surge', cvd:'CVD', flow:'FR / Flow',
    liq_est:'Liq Est', real_liq:'Real Liq', oi:'OI Squeeze',
    basis:'Basis', bb14:'BB(14)', bb16:'BB Sqz', atr:'ATR',
    ob:'Order Book', onchain:'On-chain', fg:'Fear/Greed',
    kimchi:'Kimchi', sector:'Sector',
  };
  const LAYER_ORDER = [
    'wyckoff','mtf','cvd','vsurge','breakout',
    'flow','oi','real_liq','liq_est','basis',
    'bb14','bb16','atr','fg','onchain','kimchi','sector','ob',
  ];

  let evidence = $derived((() => {
    if (deep?.layers) {
      const ev: TerminalEvidence[] = [];
      for (const name of LAYER_ORDER) {
        const lr = (deep.layers as Record<string, any>)[name];
        if (!lr) continue;
        if (lr.score === 0 && lr.sigs.length === 0) continue;
        const topSig = (lr.sigs as Array<{t:string;type:string}>)[0];
        const state: TerminalEvidence['state'] =
          lr.score >= 5 ? 'bullish' : lr.score <= -5 ? 'bearish'
          : topSig?.type === 'warn' ? 'warning'
          : topSig?.type === 'bull' ? 'bullish'
          : topSig?.type === 'bear' ? 'bearish' : 'neutral';
        ev.push({
          metric: LAYER_LABELS[name] ?? name,
          value: (lr.score >= 0 ? '+' : '') + lr.score,
          delta: '',
          interpretation: topSig?.t?.slice(0, 70) ?? '',
          state, sourceCount: lr.sigs.length,
        });
      }
      return ev;
    }
    if (!analysisData?.snapshot) return [];
    const s = analysisData.snapshot;
    const ev: TerminalEvidence[] = [];
    if (s.rsi14 != null) ev.push({ metric:'RSI 14', value:s.rsi14.toFixed(1), delta:'',
      interpretation:s.rsi14>70?'Overbought':s.rsi14<30?'Oversold':'Neutral',
      state:s.rsi14>70?'warning':s.rsi14<30?'bullish':'neutral', sourceCount:1 });
    if (s.funding_rate != null) ev.push({ metric:'Funding', value:(s.funding_rate*100).toFixed(3)+'%', delta:'',
      interpretation:s.funding_rate>0.01?'Longs paying':s.funding_rate<-0.005?'Shorts paying':'Neutral',
      state:s.funding_rate>0.015?'warning':'neutral', sourceCount:1 });
    if (s.oi_change_1h != null) ev.push({ metric:'OI 1H',
      value:(s.oi_change_1h>=0?'+':'')+(s.oi_change_1h*100).toFixed(2)+'%', delta:'',
      interpretation:s.oi_change_1h>0.02?'Expanding':s.oi_change_1h<-0.02?'Contracting':'Stable',
      state:s.oi_change_1h>0.02?'bullish':s.oi_change_1h<-0.02?'bearish':'neutral', sourceCount:1 });
    if (s.cvd_state) ev.push({ metric:'CVD', value:s.cvd_state, delta:'',
      interpretation:s.cvd_state==='buying'?'Aggressive buys':s.cvd_state==='selling'?'Aggressive sells':'Balanced',
      state:s.cvd_state==='buying'?'bullish':s.cvd_state==='selling'?'bearish':'neutral', sourceCount:1 });
    if (s.regime) ev.push({ metric:'Regime', value:s.regime.toUpperCase(), delta:'',
      interpretation:s.regime, state:s.regime==='risk_on'?'bullish':s.regime==='risk_off'?'bearish':'neutral', sourceCount:1 });
    if (s.vol_ratio_3 != null) ev.push({ metric:'Volume', value:s.vol_ratio_3.toFixed(1)+'x', delta:'',
      interpretation:s.vol_ratio_3>2?'Spike':s.vol_ratio_3>1.2?'Above avg':'Below avg',
      state:s.vol_ratio_3>2?'warning':'neutral', sourceCount:1 });
    return ev;
  })());

  const SOURCES: TerminalSource[] = $derived([
    { label: 'Binance Spot', category: 'Market', freshness: 'live', updatedAt: Date.now() },
    { label: 'Binance Perp', category: 'Market', freshness: 'recent', updatedAt: Date.now() - 15000 },
    { label: 'Market Engine', category: 'Model', freshness: 'recent', updatedAt: Date.now() - 30000,
      method: deep ? `17-layer pipeline · ${deepVerdict}` : 'Feature calc + ensemble' },
  ]);

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
  const panelBiasLabel = $derived(
    verdict?.direction === 'bullish'
      ? 'LONG BIAS'
      : verdict?.direction === 'bearish'
        ? 'SHORT BIAS'
        : 'NEUTRAL'
  );
  const panelSourceCount = $derived(SOURCES.length + evidence.reduce((sum, item) => sum + item.sourceCount, 0));

  const panelConclusion = $derived(
    verdict
      ? {
          bias: verdict.direction ? verdict.direction.toUpperCase() : '—',
          action: verdict.action || '—',
          invalidation: verdict.invalidation || '—',
        }
      : { bias: '—', action: '—', invalidation: '—' }
  );
</script>

<aside class="context-panel">
  <div class="panel-header">
    <div class="panel-symbol-line">
      <span class="panel-symbol">{panelSymbol}/USDT</span>
      <span class="panel-context">Terminal Analysis</span>
      <span class="panel-bias" data-bias={verdict?.direction ?? 'neutral'}>{panelBiasLabel}</span>
    </div>
    <div class="panel-price-line">
      <strong>{formatPanelPrice(panelPrice)}</strong>
      <span class="panel-change" data-tone={panelChange == null ? 'neutral' : panelChange >= 0 ? 'bull' : 'bear'}>
        {formatPanelChange(panelChange)}
      </span>
      <small>Sources {panelSourceCount}</small>
    </div>
    <div class="panel-actions">
      <button type="button" onclick={() => onTabChange?.('summary')}>Pin</button>
      <button type="button" onclick={() => onTabChange?.('summary')}>Compare</button>
      <button type="button" onclick={() => onTabChange?.('metrics')}>Chart</button>
      <button type="button" onclick={() => onTabChange?.('risk')}>Alert+</button>
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
        <div class="divider"></div>
        <EvidenceGrid {evidence} cols={2} {bars} {layerBarsMap} />
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
          {#if atrLevels.stop_long}
            <p class="section-label">Stop Loss (Chandelier)</p>
            <p class="mono-val stop">${Number(atrLevels.stop_long).toLocaleString('en-US', {maximumFractionDigits: 2})}</p>
            <p class="section-label">TP1 (2× ATR)</p>
            <p class="mono-val tp">{atrLevels.tp1_long ? '$' + Number(atrLevels.tp1_long).toLocaleString('en-US', {maximumFractionDigits: 2}) : '—'}</p>
            <p class="section-label">TP2 (3.5× ATR)</p>
            <p class="mono-val tp">{atrLevels.tp2_long ? '$' + Number(atrLevels.tp2_long).toLocaleString('en-US', {maximumFractionDigits: 2}) : '—'}</p>
            {#if atrLevels.atr_pct}
              <p class="section-label">ATR Volatility</p>
              <p class="mono-val">{Number(atrLevels.atr_pct).toFixed(2)}% <span class="tier-badge">{atrLevels.tier ?? ''}</span></p>
            {/if}
            {#if atrLevels.stop_short}
              <p class="section-label">Stop Short (Chandelier)</p>
              <p class="mono-val stop">${Number(atrLevels.stop_short).toLocaleString('en-US', {maximumFractionDigits: 2})}</p>
            {/if}
          {:else}
            <p class="section-label">Entry Zone</p>
            <p class="mono-val">Near VWAP or support</p>
            <p class="section-label">Stop / Invalidation</p>
            <p class="mono-val">Below swing low</p>
          {/if}
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
  .mono-val { font-family: var(--sc-font-mono); font-size: 10px; color: var(--sc-text-0); margin: 0; }
  .text-val { font-size: 10px; color: var(--sc-text-1); margin: 0; }

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
  .tier-badge {
    font-family: var(--sc-font-mono); font-size: 8px;
    padding: 1px 4px; border-radius: 2px;
    background: rgba(255,255,255,0.06); color: var(--sc-text-2);
  }

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
