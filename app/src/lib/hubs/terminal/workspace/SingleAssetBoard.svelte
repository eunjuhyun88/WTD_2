<script lang="ts">
  import CgChart from '../CgChart.svelte';
  import type { BlockPreviewHighlight, BlockSearchPreviewModel } from '$lib/terminal/blockSearchPreview';
  import { toTradingViewInterval } from '$lib/utils/timeframe';

  type BoardMode = 'board' | 'strip' | 'tv';

  let {
    symbol,
    timeframe,
    price = 0,
    change = 0,
    snapshot = null,
    chartData = [],
    annotations = [],
    indicators = null,
    derivatives = null,
    preview = null,
  }: {
    symbol: string;
    timeframe: string;
    price?: number;
    change?: number;
    snapshot?: any;
    chartData?: any[];
    annotations?: any[];
    indicators?: any;
    derivatives?: any;
    preview?: BlockSearchPreviewModel | null;
  } = $props();

  let boardMode = $state<BoardMode>('board');

  // ── ML Score derived state ──────────────────────────────────────────────
  const pWin: number | null = $derived(snapshot?.p_win ?? null);
  const blocksTriggered: string[] = $derived(snapshot?.blocks_triggered ?? []);
  const ensembleTriggered: boolean = $derived(snapshot?.ensemble_triggered ?? false);

  const DISQUALIFIERS = new Set(['volume_below_average', 'extreme_volatility', 'extended_from_ma']);
  const blocksPositive = $derived(blocksTriggered.filter((b: string) => !DISQUALIFIERS.has(b)));
  const blocksNegative = $derived(blocksTriggered.filter((b: string) => DISQUALIFIERS.has(b)));

  function pWinLabel(p: number | null): string {
    if (p == null) return 'untrained';
    return `${(p * 100).toFixed(1)}%`;
  }

  function alphaColor(score: number | null | undefined): string {
    if (score == null) return 'var(--sc-text-2, rgba(247, 242, 234, 0.72))';
    if (score >= 20) return 'var(--sc-good, #adca7c)';
    if (score <= -20) return 'var(--sc-bad, #cf7f8f)';
    return 'var(--sc-text-1, #d9d3cb)';
  }

  function pwinColor(p: number | null | undefined): string {
    if (p == null) return 'rgba(255,255,255,.28)';
    if (p >= 0.6) return 'var(--sc-good, #adca7c)';
    if (p <= 0.4) return 'var(--sc-bad, #cf7f8f)';
    return 'var(--sc-text-1, #d9d3cb)';
  }

  // Format block names: "ema_cross_up" → "EMA CROSS UP"
  function fmtBlock(name: string): string {
    return name.replace(/_/g, ' ').toUpperCase();
  }

  function fundingTone(funding: number | null | undefined): string {
    if (funding == null) return 'var(--sc-text-2, rgba(247, 242, 234, 0.72))';
    if (funding > 0.0005) return 'var(--sc-bad, #cf7f8f)';
    if (funding < -0.0005) return 'var(--sc-good, #adca7c)';
    return 'var(--sc-text-1, #d9d3cb)';
  }

  function changeTone(value: number | null | undefined): string {
    if (value == null) return 'var(--sc-text-2, rgba(247, 242, 234, 0.72))';
    if (value > 0) return 'var(--sc-good, #adca7c)';
    if (value < 0) return 'var(--sc-bad, #cf7f8f)';
    return 'var(--sc-text-1, #d9d3cb)';
  }

  function formatPrice(value: number): string {
    if (!Number.isFinite(value)) return '--';
    if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return value.toFixed(4);
  }

  function formatSigned(value: number | null | undefined, digits = 2, suffix = ''): string {
    if (value == null || !Number.isFinite(value)) return '--';
    return `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}`;
  }

  function formatFunding(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '--';
    return `${(value * 100).toFixed(4)}%`;
  }

  function formatOi(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '--';
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
    return value.toFixed(0);
  }

  function formatPercent(value: number | null | undefined, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return '--';
    return `${value.toFixed(digits)}%`;
  }

  function previewStateLabel(state: 'matched' | 'unmet' | 'unknown'): string {
    if (state === 'matched') return 'match';
    if (state === 'unmet') return 'miss';
    return 'pending';
  }

  function previewStateColor(state: 'matched' | 'unmet' | 'unknown'): string {
    if (state === 'matched') return 'var(--sc-good, #adca7c)';
    if (state === 'unmet') return 'var(--sc-bad, #cf7f8f)';
    return 'rgba(247, 242, 234, 0.62)';
  }

  function previewScopeColor(
    state: BlockSearchPreviewModel['scopeState']
  ): string {
    return state === 'aligned'
      ? 'rgba(173, 202, 124, 0.82)'
      : 'rgba(255, 196, 122, 0.82)';
  }

  function tvSymbol(pair: string): string {
    return `BINANCE:${pair}`;
  }

  function tradingViewSrc(pair: string, tf: string): string {
    const params = new URLSearchParams({
      symbol: tvSymbol(pair),
      interval: toTradingViewInterval(tf),
      theme: 'dark',
      style: '1',
      locale: 'en',
      withdateranges: '1',
      hide_side_toolbar: '0',
      allow_symbol_change: '0',
      save_image: '0',
      studies: 'RSI@tv-basicstudies,MACD@tv-basicstudies,Volume@tv-basicstudies',
    });
    return `https://www.tradingview.com/widgetembed/?${params.toString()}`;
  }

  const signalRows = $derived.by(() => [
    { label: 'Wyckoff', value: snapshot?.l1?.phase ?? '--', tone: snapshot?.l1?.score ?? 0 },
    { label: 'Flow', value: snapshot?.l2?.detail ?? '--', tone: snapshot?.l2?.score ?? 0 },
    { label: 'Fear & Greed', value: snapshot?.l7?.label ?? `${snapshot?.l7?.fear_greed ?? '--'}`, tone: snapshot?.l7?.score ?? 0 },
    { label: 'MTF', value: snapshot?.l10?.mtf_confluence ?? '--', tone: snapshot?.l10?.score ?? 0 },
    { label: 'CVD', value: snapshot?.l11?.cvd_state ?? '--', tone: snapshot?.l11?.score ?? 0 },
    { label: 'Breakout', value: snapshot?.l13?.label ?? '--', tone: snapshot?.l13?.score ?? 0 },
    { label: 'BB', value: snapshot?.l14?.bb_squeeze ? 'SQUEEZE' : snapshot?.l14?.label ?? 'OPEN', tone: snapshot?.l14?.score ?? 0 },
    { label: 'ATR', value: formatPercent(snapshot?.l15?.atr_pct ?? null), tone: snapshot?.l15?.score ?? 0 },
  ]);

  // Ensemble signal from engine (ML + blocks fused)
  const ensembleDirection = $derived(snapshot?.ensemble?.direction ?? null);
  const ensembleScore = $derived(snapshot?.ensemble?.ensemble_score ?? null);
  const ensembleConfidence = $derived(snapshot?.ensemble?.confidence ?? null);

  function ensembleColor(dir: string | null): string {
    if (!dir) return 'var(--sc-text-1, #d9d3cb)';
    if (dir === 'strong_long') return '#22c55e';
    if (dir === 'long') return '#4ade80';
    if (dir === 'short') return '#f87171';
    if (dir === 'strong_short') return '#ef4444';
    return 'var(--sc-text-1, #d9d3cb)';
  }

  function pWinColor(p: number | null): string {
    if (p == null) return 'var(--sc-text-1, #d9d3cb)';
    if (p >= 0.60) return '#22c55e';
    if (p >= 0.55) return '#4ade80';
    if (p <= 0.40) return '#ef4444';
    if (p <= 0.45) return '#f87171';
    return 'var(--sc-text-1, #d9d3cb)';
  }

  function directionLabel(dir: string | null): string {
    if (!dir) return '--';
    const labels: Record<string, string> = {
      strong_long: 'STRONG LONG',
      long: 'LONG',
      neutral: 'NEUTRAL',
      short: 'SHORT',
      strong_short: 'STRONG SHORT',
    };
    return labels[dir] ?? '--';
  }

  const statCards = $derived.by(() => [
    { label: 'Signal', value: directionLabel(ensembleDirection), tone: ensembleColor(ensembleDirection) },
    { label: 'Score', value: ensembleScore != null ? `${(ensembleScore * 100).toFixed(0)}%` : '--', tone: ensembleColor(ensembleDirection) },
    { label: 'P(Win)', value: snapshot?.p_win != null ? `${(snapshot.p_win * 100).toFixed(1)}%` : '--', tone: pWinColor(snapshot?.p_win ?? null) },
    { label: 'Blocks', value: Array.isArray(snapshot?.blocks_triggered) ? `${snapshot.blocks_triggered.length}` : '--', tone: (snapshot?.blocks_triggered?.length ?? 0) >= 3 ? '#4ade80' : 'var(--sc-text-1, #d9d3cb)' },
    { label: 'Funding', value: formatFunding(derivatives?.funding ?? null), tone: fundingTone(derivatives?.funding ?? null) },
    { label: 'OI', value: formatOi(derivatives?.oi ?? null), tone: 'var(--sc-text-1, #d9d3cb)' },
    { label: 'L/S', value: derivatives?.lsRatio != null ? derivatives.lsRatio.toFixed(2) : '--', tone: fundingTone((derivatives?.lsRatio ?? 1) - 1) },
    { label: 'Alpha', value: snapshot?.alphaScore != null ? `${snapshot.alphaScore > 0 ? '+' : ''}${snapshot.alphaScore}` : '--', tone: alphaColor(snapshot?.alphaScore ?? null) },
    { label: 'Regime', value: snapshot?.regime ?? snapshot?.snapshot?.regime ?? '--', tone: 'var(--sc-text-1, #d9d3cb)' },
    { label: 'Conf.', value: ensembleConfidence ?? '--', tone: ensembleConfidence === 'high' ? '#22c55e' : ensembleConfidence === 'medium' ? '#eab308' : 'var(--sc-text-1, #d9d3cb)' },
  ]);

  const modeOrder: BoardMode[] = ['board', 'strip', 'tv'];
  const previewCounts = $derived.by(() => {
    if (!preview) return null;
    const unmet = preview.rows.filter((row) => row.state === 'unmet').length;
    const unknown = preview.rows.filter((row) => row.state === 'unknown').length;
    return {
      unmet,
      unknown,
      score: `${preview.matchedCount}/${preview.actionableCount || preview.rows.length}`,
      compactRows: preview.rows.slice(0, 4),
    };
  });
  const chartHighlights = $derived.by(() => {
    if (!preview || chartData.length === 0 || preview.highlights.length === 0) return [];
    return preview.highlights.slice(0, 6).map((highlight) => {
      const length = chartData.length;
      const startIndex = Math.max(0, Math.min(length - 1, highlight.startIndex));
      const endIndex = Math.max(startIndex, Math.min(length - 1, highlight.endIndex));
      const left = (startIndex / length) * 100;
      const width = ((endIndex - startIndex + 1) / length) * 100;
      const focusIndex = highlight.focusIndex == null
        ? null
        : Math.max(0, Math.min(length - 1, highlight.focusIndex));
      const focusLeft = focusIndex == null ? null : ((focusIndex + 0.5) / length) * 100;

      return {
        ...highlight,
        left,
        width,
        focusLeft,
        bandColor: highlightStateBand(highlight.state),
        lineColor: highlightStateLine(highlight.state),
      };
    });
  });

  function highlightStateBand(state: BlockPreviewHighlight['state']): string {
    if (state === 'matched') return 'rgba(173, 202, 124, 0.14)';
    if (state === 'unmet') return 'rgba(207, 127, 143, 0.12)';
    return 'rgba(176, 205, 228, 0.10)';
  }

  function highlightStateLine(state: BlockPreviewHighlight['state']): string {
    if (state === 'matched') return 'rgba(173, 202, 124, 0.84)';
    if (state === 'unmet') return 'rgba(207, 127, 143, 0.82)';
    return 'rgba(176, 205, 228, 0.72)';
  }
</script>

<section class="asset-board">
  <div class="asset-board-header">
    <div class="asset-board-heading">
      <span class="asset-kicker">Asset Board</span>
      <strong>{symbol.replace('USDT', '')}</strong>
      <div class="asset-summary">
        <span>{timeframe.toUpperCase()}</span>
        <span>{snapshot?.regime ?? 'regime --'}</span>
        <span>{snapshot?.l11?.cvd_state ?? 'cvd --'}</span>
        <span>{snapshot?.l10?.mtf_confluence ?? 'mtf --'}</span>
      </div>
    </div>
    <div class="asset-board-toolbar">
      <div class="asset-mode-switch" role="tablist" aria-label="Asset board mode">
        {#each modeOrder as mode}
          <button type="button" class:active={boardMode === mode} onclick={() => boardMode = mode}>
            {mode.toUpperCase()}
          </button>
        {/each}
      </div>
      <div class="asset-headline-metrics">
        <span class="headline-price">${formatPrice(price)}</span>
        <span class="headline-change" style={`color:${changeTone(change)}`}>{formatSigned(change, 2, '%')}</span>
        <span class="headline-alpha" style={`color:${alphaColor(snapshot?.alphaScore ?? null)}`}>
          alpha {snapshot?.alphaScore != null ? `${snapshot.alphaScore > 0 ? '+' : ''}${snapshot.alphaScore}` : '--'}
        </span>
        {#if preview && previewCounts}
          <span class="headline-preview" style={`color:${previewScopeColor(preview.scopeState)}`}>
            search {previewCounts.score}
          </span>
        {/if}
        {#if ensembleTriggered}
          <span class="headline-ensemble">⬥ ENSEMBLE</span>
        {:else if pWin != null}
          <span class="headline-pwin" style={`color:${pWinColor(pWin)}`}>
            ml {pWinLabel(pWin)}
          </span>
        {/if}
      </div>
    </div>
  </div>

  {#if boardMode === 'board'}
    <div class="asset-layout asset-layout-board">
      <section class="asset-hero">
        <div class="asset-ribbon">
          <span>regime {snapshot?.regime ?? '--'}</span>
          <span>cvd {snapshot?.l11?.cvd_state ?? '--'}</span>
          <span>mtf {snapshot?.l10?.mtf_confluence ?? '--'}</span>
          <span>bb {snapshot?.l14?.bb_squeeze ? 'SQZ' : 'OPEN'}</span>
          <span>atr {formatPercent(snapshot?.l15?.atr_pct ?? null)}</span>
        </div>
        <div class="asset-chart-shell">
          {#if preview && previewCounts}
            <section class="preview-card preview-card-floating" data-scope={preview.scopeState}>
              <div class="preview-card-head">
                <div>
                  <span class="preview-kicker">Block Search Preview</span>
                  <strong>{preview.query}</strong>
                </div>
                <div class="preview-score-stack">
                  <span class="preview-score">{previewCounts.score}</span>
                  <span class="preview-score-label">matched</span>
                </div>
              </div>
              <div class="preview-scope-line">
                <span class="preview-scope-pill">{preview.scopeState === 'aligned' ? 'aligned' : 'scope drift'}</span>
                <span>{preview.scopeDetail}</span>
              </div>
              <div class="preview-chip-row">
                <span>{preview.direction ?? 'long'} bias</span>
                <span>{preview.symbol?.replace('USDT', '') ?? symbol.replace('USDT', '')}</span>
                <span>{(preview.timeframe ?? timeframe).toUpperCase()}</span>
                <span>{previewCounts.unmet} miss</span>
                <span>{previewCounts.unknown} pending</span>
              </div>
              <div class="preview-row-list">
                {#each preview.rows as row}
                  <div class="preview-row">
                    <div class="preview-row-head">
                      <span class="preview-row-token">{row.token}</span>
                      <span class="preview-row-state" style={`color:${previewStateColor(row.state)}`}>
                        {previewStateLabel(row.state)}
                      </span>
                    </div>
                    <strong>{row.label}</strong>
                    <p>{row.detail}</p>
                  </div>
                {/each}
              </div>
            </section>
          {/if}
          <div class="asset-chart asset-chart-hero">
            <CgChart
              data={chartData}
              currentPrice={price}
              annotations={annotations}
              indicators={indicators}
              symbol={symbol}
              timeframe={timeframe}
              changePct={change}
              snapshot={snapshot}
              derivatives={derivatives}
            />
            {#if chartHighlights.length > 0}
              <div class="chart-highlight-layer" aria-hidden="true">
                {#each chartHighlights as highlight}
                  <div
                    class="chart-highlight-band"
                    style={`left:${highlight.left}%;width:${highlight.width}%;background:${highlight.bandColor};border-color:${highlight.lineColor};`}
                  >
                    <span class="chart-highlight-label" style={`color:${highlight.lineColor}`}>{highlight.label}</span>
                    {#if highlight.focusLeft != null}
                      <span class="chart-highlight-focus" style={`left:${highlight.focusLeft - highlight.left}%;background:${highlight.lineColor};`}></span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </section>

      <aside class="asset-sidepanel">
        <div class="asset-side-title">Quant Matrix</div>
        <div class="asset-stat-grid">
          {#each statCards as stat}
            <div class="asset-stat-card">
              <span>{stat.label}</span>
              <strong style={`color:${stat.tone}`}>{stat.value}</strong>
            </div>
          {/each}
        </div>

        <!-- ML Score Panel -->
        <div class="ml-score-panel" class:ml-ensemble={ensembleTriggered}>
          <div class="ml-score-head">
            <span class="asset-side-title">ML Score</span>
            {#if ensembleTriggered}
              <span class="ml-ensemble-badge">ENSEMBLE ⬥</span>
            {/if}
          </div>
          <div class="ml-score-row">
            <span class="ml-label">P(win)</span>
            <strong class="ml-value" style={`color:${pWinColor(pWin)}`}>{pWinLabel(pWin)}</strong>
          </div>
          {#if blocksPositive.length > 0}
            <div class="ml-blocks-section">
              <span class="ml-blocks-label">Active Blocks</span>
              <div class="ml-chip-row">
                {#each blocksPositive as block}
                  <span class="ml-chip ml-chip-active">{block.replace(/_/g, ' ')}</span>
                {/each}
              </div>
            </div>
          {/if}
          {#if blocksNegative.length > 0}
            <div class="ml-blocks-section">
              <span class="ml-blocks-label ml-blocks-label-warn">Disqualifiers</span>
              <div class="ml-chip-row">
                {#each blocksNegative as block}
                  <span class="ml-chip ml-chip-warn">{block.replace(/_/g, ' ')}</span>
                {/each}
              </div>
            </div>
          {/if}
          {#if pWin == null}
            <p class="ml-untrained-note">Engine not trained yet. Run /train to enable scoring.</p>
          {/if}
        </div>
      </aside>
    </div>

    <div class="signal-ladder">
      {#each signalRows as row}
        <div class="signal-row">
          <span>{row.label}</span>
          <strong style={`color:${alphaColor(row.tone)}`}>{row.value}</strong>
        </div>
      {/each}
    </div>

    {#if snapshot?.blocks_triggered?.length > 0}
      <div class="engine-blocks-row">
        <span class="engine-blocks-label">ENGINE</span>
        {#each snapshot.blocks_triggered as block}
          <span class="engine-block-chip">{fmtBlock(block)}</span>
        {/each}
        {#if snapshot?._fallback}
          <span class="engine-block-chip engine-block-fallback">FALLBACK</span>
        {/if}
      </div>
    {:else if snapshot && !snapshot._fallback}
      <div class="engine-blocks-row engine-blocks-quiet">
        <span class="engine-blocks-label">ENGINE</span>
        <span class="engine-blocks-none">no blocks triggered</span>
        {#if snapshot?.p_win != null}
          <span class="engine-pwin-inline" style={`color:${pwinColor(snapshot.p_win)}`}>
            P(Win) {(snapshot.p_win * 100).toFixed(0)}%
          </span>
        {/if}
      </div>
    {/if}
  {:else if boardMode === 'strip'}
    <div class="asset-layout asset-layout-strip">
      <section class="strip-main">
        <div class="asset-chart asset-chart-strip">
          <CgChart
            data={chartData}
            currentPrice={price}
            annotations={annotations}
            indicators={indicators}
            symbol={symbol}
            timeframe={timeframe}
            changePct={change}
            snapshot={snapshot}
            derivatives={derivatives}
          />
          {#if chartHighlights.length > 0}
            <div class="chart-highlight-layer chart-highlight-layer-compact" aria-hidden="true">
              {#each chartHighlights as highlight}
                <div
                  class="chart-highlight-band"
                  style={`left:${highlight.left}%;width:${highlight.width}%;background:${highlight.bandColor};border-color:${highlight.lineColor};`}
                >
                  {#if highlight.focusLeft != null}
                    <span class="chart-highlight-focus" style={`left:${highlight.focusLeft - highlight.left}%;background:${highlight.lineColor};`}></span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </section>
      <section class="strip-side">
        {#if preview && previewCounts}
          <section class="preview-card preview-card-compact" data-scope={preview.scopeState}>
            <div class="preview-card-head">
              <div>
                <span class="preview-kicker">Block Search Preview</span>
                <strong>{preview.query}</strong>
              </div>
              <span class="preview-score">{previewCounts.score}</span>
            </div>
            <div class="preview-scope-line">
              <span class="preview-scope-pill">{preview.scopeState === 'aligned' ? 'aligned' : 'scope drift'}</span>
              <span>{preview.scopeDetail}</span>
            </div>
            <div class="preview-row-list preview-row-list-compact">
              {#each previewCounts.compactRows as row}
                <div class="preview-row preview-row-compact">
                  <div class="preview-row-head">
                    <span class="preview-row-token">{row.token}</span>
                    <span class="preview-row-state" style={`color:${previewStateColor(row.state)}`}>
                      {previewStateLabel(row.state)}
                    </span>
                  </div>
                  <strong>{row.label}</strong>
                </div>
              {/each}
            </div>
          </section>
        {/if}
        <div class="asset-ribbon asset-ribbon-stack">
          <span>funding {formatFunding(derivatives?.funding ?? null)}</span>
          <span>oi {formatOi(derivatives?.oi ?? null)}</span>
          <span>ls {derivatives?.lsRatio?.toFixed(2) ?? '--'}</span>
          <span>fear {snapshot?.l7?.fear_greed ?? '--'}</span>
        </div>
        <div class="micro-grid">
          {#each signalRows as row}
            <div class="micro-card">
              <span>{row.label}</span>
              <strong style={`color:${alphaColor(row.tone)}`}>{row.value}</strong>
            </div>
          {/each}
        </div>
      </section>
    </div>
  {:else if boardMode === 'tv'}
    <div class="asset-layout asset-layout-tv">
      <section class="tv-main">
        <div class="tv-main-header">
          <span class="tv-label">TradingView Focus</span>
          <a class="tv-open-link" href={`https://www.tradingview.com/chart/?symbol=${tvSymbol(symbol)}`} target="_blank" rel="noreferrer">
            Open TV
          </a>
        </div>
        <div class="tv-frame-wrap">
          <iframe
            title={`TradingView ${symbol}`}
            src={tradingViewSrc(symbol, timeframe)}
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
          ></iframe>
        </div>
      </section>
      <aside class="tv-side">
        <div class="asset-side-title">Context Strip</div>
        {#if preview && previewCounts}
          <section class="preview-card preview-card-compact" data-scope={preview.scopeState}>
            <div class="preview-card-head">
              <div>
                <span class="preview-kicker">Block Search Preview</span>
                <strong>{preview.query}</strong>
              </div>
              <span class="preview-score">{previewCounts.score}</span>
            </div>
            <div class="preview-chip-row preview-chip-row-compact">
              <span>{preview.direction ?? 'long'} bias</span>
              <span>{previewCounts.unmet} miss</span>
              <span>{previewCounts.unknown} pending</span>
            </div>
            <div class="preview-scope-line">
              <span class="preview-scope-pill">{preview.scopeState === 'aligned' ? 'aligned' : 'scope drift'}</span>
              <span>{preview.scopeDetail}</span>
            </div>
            <div class="preview-row-list preview-row-list-compact">
              {#each previewCounts.compactRows as row}
                <div class="preview-row preview-row-compact">
                  <div class="preview-row-head">
                    <span class="preview-row-token">{row.token}</span>
                    <span class="preview-row-state" style={`color:${previewStateColor(row.state)}`}>
                      {previewStateLabel(row.state)}
                    </span>
                  </div>
                  <strong>{row.label}</strong>
                </div>
              {/each}
            </div>
          </section>
        {/if}
        <div class="asset-stat-grid">
          {#each statCards as stat}
            <div class="asset-stat-card">
              <span>{stat.label}</span>
              <strong style={`color:${stat.tone}`}>{stat.value}</strong>
            </div>
          {/each}
        </div>
        <div class="micro-grid">
          {#each signalRows.slice(0, 6) as row}
            <div class="micro-card">
              <span>{row.label}</span>
              <strong style={`color:${alphaColor(row.tone)}`}>{row.value}</strong>
            </div>
          {/each}
        </div>
      </aside>
    </div>
  {/if}
</section>

<style>
  .asset-board {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background:
      radial-gradient(circle at top right, rgba(173, 202, 124, 0.06), transparent 24%),
      linear-gradient(180deg, rgba(7, 11, 18, 0.9), rgba(4, 8, 14, 0.82));
  }

  .asset-board-header,
  .asset-board-toolbar,
  .asset-layout,
  .tv-main-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .asset-layout-board,
  .asset-layout-tv {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.8fr);
    gap: 12px;
  }

  .asset-layout-strip {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.9fr);
    gap: 12px;
  }

  .asset-board-heading {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .asset-kicker,
  .tv-label,
  .asset-side-title {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(176, 205, 228, 0.62);
  }

  .asset-board-heading strong {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 28px;
    line-height: 1;
    letter-spacing: 0.04em;
    color: var(--sc-text-0, #f7f2ea);
  }

  .asset-summary,
  .asset-ribbon {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .asset-summary span,
  .asset-ribbon span {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: rgba(247, 242, 234, 0.56);
  }

  .asset-mode-switch {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }

  .asset-mode-switch button {
    min-height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(247, 242, 234, 0.56);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .asset-mode-switch button.active {
    background: rgba(176, 205, 228, 0.14);
    color: rgba(247, 242, 234, 0.92);
  }

  .headline-price,
  .headline-change,
  .headline-alpha,
  .headline-preview,
  .asset-stat-card strong,
  .signal-row strong,
  .tv-open-link {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
  }

  .asset-headline-metrics {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .headline-preview {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .headline-price {
    font-size: 16px;
    color: rgba(247, 242, 234, 0.92);
  }

  .asset-hero,
  .asset-sidepanel,
  .strip-main,
  .strip-side,
  .tv-main,
  .tv-side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 14px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.025);
  }

  .asset-chart-hero {
    min-height: 420px;
  }

  .asset-chart-strip {
    min-height: 300px;
  }

  .asset-chart {
    position: relative;
  }

  .asset-chart-shell {
    position: relative;
  }

  .chart-highlight-layer {
    position: absolute;
    inset: 10px 10px 12px;
    pointer-events: none;
    z-index: 1;
  }

  .chart-highlight-layer-compact {
    inset: 8px 8px 10px;
  }

  .chart-highlight-band {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 2px;
    border-left: 1px solid;
    border-right: 1px solid;
    border-radius: 8px;
    overflow: visible;
  }

  .chart-highlight-label {
    position: absolute;
    top: 8px;
    left: 6px;
    max-width: calc(100% - 12px);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  }

  .chart-highlight-focus {
    position: absolute;
    top: calc(100% - 28px);
    width: 8px;
    height: 8px;
    border-radius: 999px;
    box-shadow: 0 0 0 3px rgba(4, 8, 14, 0.42);
    transform: translateX(-50%);
  }

  .preview-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background:
      linear-gradient(180deg, rgba(9, 14, 22, 0.92), rgba(8, 11, 18, 0.88));
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
  }

  .preview-card[data-scope='aligned'] {
    border-color: rgba(173, 202, 124, 0.22);
  }

  .preview-card[data-scope='symbol_mismatch'],
  .preview-card[data-scope='timeframe_mismatch'],
  .preview-card[data-scope='symbol_and_timeframe_mismatch'] {
    border-color: rgba(255, 196, 122, 0.24);
  }

  .preview-card-floating {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 2;
    width: min(420px, calc(100% - 28px));
    max-height: calc(100% - 28px);
    overflow: auto;
    backdrop-filter: blur(14px);
  }

  .preview-card-compact {
    gap: 8px;
  }

  .preview-card-head,
  .preview-row-head,
  .preview-scope-line {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
  }

  .preview-kicker,
  .preview-score,
  .preview-score-label,
  .preview-scope-pill,
  .preview-row-token,
  .preview-row-state {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .preview-kicker,
  .preview-row-token {
    color: rgba(176, 205, 228, 0.62);
  }

  .preview-card-head strong,
  .preview-row strong {
    color: rgba(247, 242, 234, 0.92);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
  }

  .preview-score-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .preview-score {
    color: rgba(247, 242, 234, 0.92);
    font-size: 13px;
  }

  .preview-score-label {
    color: rgba(247, 242, 234, 0.46);
  }

  .preview-scope-line {
    font-size: 11px;
    color: rgba(247, 242, 234, 0.66);
  }

  .preview-scope-pill {
    flex: 0 0 auto;
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(247, 242, 234, 0.82);
  }

  .preview-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .preview-chip-row span {
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(247, 242, 234, 0.68);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
  }

  .preview-row-list {
    display: grid;
    gap: 8px;
  }

  .preview-row-list-compact {
    grid-template-columns: 1fr;
  }

  .preview-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .preview-row p {
    margin: 0;
    color: rgba(247, 242, 234, 0.56);
    font-size: 11px;
    line-height: 1.45;
  }

  .preview-row-compact {
    gap: 2px;
  }

  .preview-row-compact strong {
    font-size: 11px;
  }

  .asset-stat-grid,
  .micro-grid,
  .signal-ladder {
    display: grid;
    gap: 8px;
  }

  .asset-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .micro-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .signal-ladder {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .asset-stat-card,
  .micro-card,
  .signal-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .asset-stat-card span,
  .micro-card span,
  .signal-row span {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    color: rgba(247, 242, 234, 0.5);
  }

  .asset-ribbon-stack {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  /* ── ML Score Panel ─────────────────────────────────────────────────── */
  .ml-score-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.025);
    transition: border-color 0.25s;
  }

  .ml-score-panel.ml-ensemble {
    border-color: rgba(173, 202, 124, 0.35);
    background: rgba(173, 202, 124, 0.04);
  }

  .ml-score-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ml-ensemble-badge {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--sc-good, #adca7c);
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(173, 202, 124, 0.12);
    border: 1px solid rgba(173, 202, 124, 0.28);
  }

  .ml-score-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .ml-label {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    color: rgba(247, 242, 234, 0.5);
  }

  .ml-value {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
  }

  .ml-blocks-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ml-blocks-label {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(247, 242, 234, 0.42);
  }

  .ml-blocks-label-warn {
    color: rgba(207, 127, 143, 0.72);
  }

  .ml-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .ml-chip {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    padding: 3px 7px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .ml-chip-active {
    background: rgba(173, 202, 124, 0.10);
    color: rgba(173, 202, 124, 0.88);
    border: 1px solid rgba(173, 202, 124, 0.18);
  }

  .ml-chip-warn {
    background: rgba(207, 127, 143, 0.10);
    color: rgba(207, 127, 143, 0.88);
    border: 1px solid rgba(207, 127, 143, 0.18);
  }

  .ml-untrained-note {
    margin: 0;
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    color: rgba(247, 242, 234, 0.35);
    line-height: 1.5;
  }

  /* headline badges */
  .headline-ensemble {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--sc-good, #adca7c);
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(173, 202, 124, 0.12);
    border: 1px solid rgba(173, 202, 124, 0.28);
    animation: ensemblePulse 2s ease-in-out infinite;
  }

  .headline-pwin {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 11px;
    letter-spacing: 0.06em;
  }

  @keyframes ensemblePulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.65; }
  }

  .tv-frame-wrap {
    min-height: 560px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.32);
  }

  .tv-frame-wrap iframe {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 560px;
    border: 0;
  }

  .tv-open-link {
    font-size: 11px;
    color: rgba(176, 205, 228, 0.84);
    text-decoration: none;
  }

  @media (max-width: 1100px) {
    .asset-layout-board,
    .asset-layout-strip,
    .asset-layout-tv {
      grid-template-columns: 1fr;
    }

    .signal-ladder {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .preview-card-floating {
      position: static;
      width: 100%;
      max-height: none;
      margin-bottom: 12px;
    }

    .chart-highlight-label {
      font-size: 8px;
    }
  }

  @media (max-width: 720px) {
    .asset-board {
      padding: 12px;
    }

    .asset-mode-switch {
      width: 100%;
      justify-content: space-between;
      overflow-x: auto;
    }

    .asset-stat-grid,
    .micro-grid,
    .signal-ladder,
    .asset-ribbon-stack {
      grid-template-columns: 1fr;
    }

    .asset-chart-hero,
    .asset-chart-strip {
      min-height: 240px;
    }

    .tv-frame-wrap,
    .tv-frame-wrap iframe {
      min-height: 360px;
    }
  }

  /* ── Engine blocks row ────────────────────────────────────────── */
  .engine-blocks-row {
    display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
    padding: 6px 0;
    border-top: 1px solid rgba(255,255,255,.06);
    margin-top: 4px;
  }
  .engine-blocks-label {
    font-size: 8px; font-weight: 700; letter-spacing: .8px;
    color: rgba(255,255,255,.25);
    flex-shrink: 0; margin-right: 2px;
  }
  .engine-block-chip {
    font-size: 8px; font-weight: 600; letter-spacing: .4px;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(173,202,124,.12);
    color: #adca7c;
    border: 1px solid rgba(173,202,124,.25);
  }
  .engine-block-fallback {
    background: rgba(207,127,143,.1);
    color: #cf7f8f;
    border-color: rgba(207,127,143,.25);
  }
  .engine-blocks-quiet { opacity: .55; }
  .engine-blocks-none {
    font-size: 8px; color: rgba(255,255,255,.3);
  }
  .engine-pwin-inline {
    font-size: 9px; font-weight: 700; margin-left: 4px;
  }
</style>
