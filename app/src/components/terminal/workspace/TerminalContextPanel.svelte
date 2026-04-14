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
    onAction?: (text: string) => void;
    onCapture?: () => void;
    bars?: any[];
    layerBarsMap?: Record<string, any[]>;
  }
  let {
    analysisData,
    newsData,
    activeTab = 'summary',
    onTabChange,
    onAction,
    onCapture,
    bars = [],
    layerBarsMap = {},
  }: Props = $props();

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
  const entryPlan = $derived.by(() => {
    const price = Number(panelPrice ?? 0);
    const entry = Number(atrLevels.entry_long ?? atrLevels.entry ?? (price ? price * 0.994 : 0));
    const stop = Number(atrLevels.stop_long ?? atrLevels.stop ?? (price ? price * 0.988 : 0));
    const tp1 = Number(atrLevels.tp1_long ?? atrLevels.target ?? (price ? price * 1.008 : 0));
    const tp2 = Number(atrLevels.tp2_long ?? (price ? price * 1.016 : 0));
    const risk = entry && stop ? Math.abs(entry - stop) : 0;
    const reward = entry && tp2 ? Math.abs(tp2 - entry) : 0;
    const rr = risk > 0 ? Math.max(0.1, reward / risk) : 0;
    const confidencePct = pWin != null
      ? pWin * 100
      : verdict?.confidence === 'high'
        ? 72
        : verdict?.confidence === 'medium'
          ? 58
          : 44;
    return { price, entry, stop, tp1, tp2, rr, confidencePct };
  });
  const entryLevels = $derived.by(() => [
    { label: 'TP2', value: entryPlan.tp2, tone: 'good', distance: entryPlan.price ? ((entryPlan.tp2 - entryPlan.price) / entryPlan.price) * 100 : 0 },
    { label: 'TP1', value: entryPlan.tp1, tone: 'good', distance: entryPlan.price ? ((entryPlan.tp1 - entryPlan.price) / entryPlan.price) * 100 : 0 },
    { label: 'NOW', value: entryPlan.price, tone: 'info', distance: 0 },
    { label: 'ENTRY', value: entryPlan.entry, tone: 'good', distance: entryPlan.price ? ((entryPlan.entry - entryPlan.price) / entryPlan.price) * 100 : 0 },
    { label: 'STOP', value: entryPlan.stop, tone: 'bad', distance: entryPlan.price ? ((entryPlan.stop - entryPlan.price) / entryPlan.price) * 100 : 0 },
  ]);
  const riskRows = $derived.by(() => [
    { label: 'Bias', value: verdict?.direction ? `${verdict.direction} continuation` : 'Neutral', tone: verdict?.direction === 'bearish' ? 'bad' : verdict?.direction === 'bullish' ? 'good' : 'neutral' },
    { label: 'Action', value: verdict?.action || 'Wait for confirmation', tone: 'good' },
    { label: 'Avoid', value: verdict?.against?.[0] || 'Chasing extension', tone: 'warn' },
    { label: 'Risk Trigger', value: fundingMetrics[0]?.value ? `Funding ${fundingMetrics[0].value}` : 'Funding / CVD flip', tone: 'warn' },
    { label: 'Invalidation', value: verdict?.invalidation || (entryPlan.stop ? `$${formatPanelPrice(entryPlan.stop)}` : 'Structure break'), tone: 'bad' },
    { label: 'Valid Until', value: 'Next candle close', tone: 'neutral' },
  ]);
  const flowRows = $derived.by(() => {
    const rows = [
      evidence.find((item) => item.metric.includes('CVD')),
      evidence.find((item) => item.metric.includes('OI')),
      evidence.find((item) => item.metric.includes('Funding') || item.metric.includes('FR')),
      evidence.find((item) => item.metric.includes('Volume') || item.metric.includes('Vol')),
    ].filter(Boolean) as TerminalEvidence[];
    return rows.length > 0 ? rows : evidence.slice(0, 4);
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
      <button type="button" onclick={() => onTabChange?.('summary')}>Summary</button>
      <button type="button" onclick={() => requestBackendAction('compare')}>Compare</button>
      <button type="button" onclick={() => onTabChange?.('metrics')}>Flow</button>
      <button type="button" onclick={() => requestBackendAction('alert')}>Alert Draft</button>
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
            <div class="entry-cell"><span>Entry</span><strong class="tp">{formatPanelPrice(entryPlan.entry)}</strong></div>
            <div class="entry-cell"><span>Stop</span><strong class="stop">{formatPanelPrice(entryPlan.stop)}</strong></div>
            <div class="entry-cell"><span>TP1</span><strong class="tp">{formatPanelPrice(entryPlan.tp1)}</strong></div>
            <div class="entry-cell"><span>TP2</span><strong class="tp">{formatPanelPrice(entryPlan.tp2)}</strong></div>
          </div>
          <div class="rr-card">
            <div class="rr-head">
              <span>Risk : Reward</span>
              <strong>1 : {entryPlan.rr ? entryPlan.rr.toFixed(1) : '—'}</strong>
            </div>
            <div class="rr-bar">
              <span class="rr-risk" style={`width:${entryPlan.rr ? Math.min(45, 100 / (entryPlan.rr + 1)) : 25}%`}></span>
              <span class="rr-reward" style={`left:${entryPlan.rr ? Math.min(45, 100 / (entryPlan.rr + 1)) + 2 : 27}%;width:${entryPlan.rr ? Math.max(20, 96 - Math.min(45, 100 / (entryPlan.rr + 1))) : 69}%`}></span>
            </div>
          </div>
          <div class="level-stack">
            {#each entryLevels as level}
              <div class="level-row" data-tone={level.tone}>
                <span class="level-dot"></span>
                <span class="level-label">{level.label}</span>
                <strong>{formatPanelPrice(level.value)}</strong>
                <small>{formatDistance(level.distance)}</small>
              </div>
            {/each}
          </div>
          <div class="prob-row">
            <span>P(win)</span>
            <div class="prob-track"><span style={`width:${Math.max(5, Math.min(95, entryPlan.confidencePct))}%`}></span></div>
            <strong>{entryPlan.confidencePct.toFixed(0)}%</strong>
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
            {#each riskRows as row}
              <div class="action-line" data-tone={row.tone}>
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
            {#each flowRows as item}
              <div class="flow-row" data-state={item.state}>
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
