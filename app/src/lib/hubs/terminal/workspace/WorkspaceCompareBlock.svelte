<script lang="ts">
  import CgChart from '../CgChart.svelte';
  import type { BlockPreviewHighlight, BlockSearchPreviewModel } from '$lib/terminal/blockSearchPreview';
  import { buildBlockSearchPreview } from '$lib/terminal/blockSearchPreview';
  import { toTradingViewInterval } from '$lib/utils/timeframe';
  import {
    bindWorkspaceComparePreviewQuery,
    formatTerminalCompareSymbol,
    type WorkspaceCompareBlock
  } from '$lib/terminal/workspaceCompare';

  type BoardMode = 'grid' | 'focus' | 'single' | 'tv';

  let {
    block,
    selected = false,
    onSelect = () => {},
  }: {
    block: WorkspaceCompareBlock;
    selected?: boolean;
    onSelect?: (blockId: string) => void;
  } = $props();

  let boardMode = $state<BoardMode>('grid');
  let focusSymbol = $state('');
  let lastBlockId = $state<string | null>(null);

  const modeOrder: BoardMode[] = ['grid', 'focus', 'single', 'tv'];
  const modeLabel: Record<BoardMode, string> = {
    grid: 'Grid',
    focus: 'Focus',
    single: 'Single',
    tv: 'TV',
  };

  $effect(() => {
    if (block.id !== lastBlockId) {
      lastBlockId = block.id;
      boardMode = block.cards.length > 2 ? 'grid' : 'focus';
      focusSymbol = block.cards[0]?.symbol ?? '';
      return;
    }

    if (!block.cards.some((card) => card.symbol === focusSymbol)) {
      focusSymbol = block.cards[0]?.symbol ?? '';
    }
  });

  const activeCard = $derived(block.cards.find((card) => card.symbol === focusSymbol) ?? block.cards[0] ?? null);
  const compareLeaders = $derived.by(() => {
    const byAlpha = [...block.cards]
      .filter((card) => typeof card.snapshot?.alphaScore === 'number')
      .sort((a, b) => (b.snapshot.alphaScore ?? -Infinity) - (a.snapshot.alphaScore ?? -Infinity))[0];
    const byFunding = [...block.cards]
      .filter((card) => typeof card.derivatives?.funding === 'number')
      .sort((a, b) => Math.abs((b.derivatives?.funding ?? 0)) - Math.abs((a.derivatives?.funding ?? 0)))[0];
    const byMomentum = [...block.cards]
      .filter((card) => typeof card.change24h === 'number')
      .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0];

    return { byAlpha, byFunding, byMomentum };
  });
  const previewBySymbol = $derived.by(() => {
    const previews = new Map<string, BlockSearchPreviewModel | null>();
    for (const card of block.cards) {
      previews.set(
        card.symbol,
        buildBlockSearchPreview({
          parsedQuery: bindWorkspaceComparePreviewQuery(block.previewQuery, card.symbol, card.timeframe),
          currentSymbol: card.symbol,
          currentTimeframe: card.timeframe,
          chartData: card.chartData,
          snapshot: card.snapshot,
          indicators: card.indicators,
          price: card.price,
        })
      );
    }
    return previews;
  });
  const activePreview = $derived(activeCard ? previewBySymbol.get(activeCard.symbol) ?? null : null);
  const activePreviewCounts = $derived.by(() => buildPreviewCounts(activePreview));

  function selectCard(symbol: string) {
    focusSymbol = symbol;
    onSelect(block.id);
  }

  function setBoardMode(mode: BoardMode) {
    boardMode = mode;
    onSelect(block.id);
  }

  function alphaColor(score: number | null | undefined): string {
    if (score == null) return 'var(--sc-text-2, rgba(247, 242, 234, 0.72))';
    if (score >= 20) return 'var(--sc-good, #adca7c)';
    if (score <= -20) return 'var(--sc-bad, #cf7f8f)';
    return 'var(--sc-text-1, #d9d3cb)';
  }

  function fundingTone(funding: number | null | undefined): string {
    if (funding == null) return 'var(--sc-text-2, rgba(247, 242, 234, 0.72))';
    if (funding > 0.0005) return 'var(--sc-bad, #cf7f8f)';
    if (funding < -0.0005) return 'var(--sc-good, #adca7c)';
    return 'var(--sc-text-1, #d9d3cb)';
  }

  function changeTone(change: number | null | undefined): string {
    if (change == null) return 'var(--sc-text-2, rgba(247, 242, 234, 0.72))';
    if (change > 0) return 'var(--sc-good, #adca7c)';
    if (change < 0) return 'var(--sc-bad, #cf7f8f)';
    return 'var(--sc-text-1, #d9d3cb)';
  }

  function formatPrice(price: number): string {
    if (!Number.isFinite(price)) return '--';
    if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (price >= 1) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return price.toFixed(4);
  }

  function formatSigned(value: number | null | undefined, digits = 2, suffix = ''): string {
    if (value == null || !Number.isFinite(value)) return '--';
    return `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}`;
  }

  function formatFunding(funding: number | null | undefined): string {
    if (funding == null || !Number.isFinite(funding)) return '--';
    return `${(funding * 100).toFixed(4)}%`;
  }

  function formatOi(oi: number | null | undefined): string {
    if (oi == null || !Number.isFinite(oi)) return '--';
    if (oi >= 1e9) return `${(oi / 1e9).toFixed(1)}B`;
    if (oi >= 1e6) return `${(oi / 1e6).toFixed(1)}M`;
    if (oi >= 1e3) return `${(oi / 1e3).toFixed(0)}K`;
    return oi.toFixed(0);
  }

  function formatLs(ls: number | null | undefined): string {
    if (ls == null || !Number.isFinite(ls)) return '--';
    return ls.toFixed(2);
  }

  function formatPercent(value: number | null | undefined, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return '--';
    return `${value.toFixed(digits)}%`;
  }

  function tvSymbol(symbol: string): string {
    return `BINANCE:${symbol}`;
  }

  function tradingViewSrc(symbol: string, timeframe: string): string {
    const params = new URLSearchParams({
      symbol: tvSymbol(symbol),
      interval: toTradingViewInterval(timeframe),
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

  function focusBadge(card: WorkspaceCompareBlock['cards'][number]) {
    if (card.snapshot?.l14?.bb_squeeze) return 'BB squeeze';
    if (card.snapshot?.l10?.mtf_confluence === 'TRIPLE') return 'MTF triple';
    if (card.snapshot?.l11?.cvd_state && card.snapshot.l11.cvd_state !== 'NEUTRAL') {
      return `CVD ${card.snapshot.l11.cvd_state}`;
    }
    return card.snapshot?.regime ?? 'regime --';
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

  function previewScopeColor(state: BlockSearchPreviewModel['scopeState']): string {
    return state === 'aligned'
      ? 'rgba(173, 202, 124, 0.82)'
      : 'rgba(255, 196, 122, 0.82)';
  }

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

  function buildPreviewCounts(preview: BlockSearchPreviewModel | null) {
    if (!preview) return null;
    const unmet = preview.rows.filter((row) => row.state === 'unmet').length;
    const unknown = preview.rows.filter((row) => row.state === 'unknown').length;
    return {
      unmet,
      unknown,
      score: `${preview.matchedCount}/${preview.actionableCount || preview.rows.length}`,
      compactRows: preview.rows.slice(0, 4),
    };
  }

  function buildChartHighlights(
    preview: BlockSearchPreviewModel | null,
    chartData: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>
  ) {
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
  }
</script>

<section class="compare-block" class:selected>
  <div class="compare-header">
    <div class="compare-heading">
      <span class="compare-kicker">Quant Board</span>
      <strong>{block.symbols.map(formatTerminalCompareSymbol).join(' vs ')}</strong>
      <div class="compare-summary">
        <span>{block.timeframe.toUpperCase()}</span>
        {#if compareLeaders.byAlpha}
          <span>alpha lead {formatTerminalCompareSymbol(compareLeaders.byAlpha.symbol)}</span>
        {/if}
        {#if compareLeaders.byFunding}
          <span>crowding {formatTerminalCompareSymbol(compareLeaders.byFunding.symbol)}</span>
        {/if}
        {#if compareLeaders.byMomentum}
          <span>move {formatTerminalCompareSymbol(compareLeaders.byMomentum.symbol)}</span>
        {/if}
        {#if activePreview && activePreviewCounts}
          <span class="compare-search-pill" style={`color:${previewScopeColor(activePreview.scopeState)}`}>
            search {activePreviewCounts.score}
          </span>
        {/if}
      </div>
    </div>

    <div class="compare-meta">
      <div class="compare-mode-switch" role="tablist" aria-label="Compare board mode">
        {#each modeOrder as mode}
          <button
            type="button"
            class:active={boardMode === mode}
            onclick={() => setBoardMode(mode)}
          >
            {modeLabel[mode]}
          </button>
        {/each}
      </div>
      <div class="compare-tag-row">
        <span class="compare-timeframe">{block.timeframe.toUpperCase()}</span>
        {#each block.focusTerms as term}
          <span class="compare-chip">{term}</span>
        {/each}
      </div>
    </div>
  </div>

  <div class="compare-watchstrip">
    {#each block.cards as card}
      <button
        type="button"
        class="watch-pill"
        class:active={activeCard?.symbol === card.symbol}
        onclick={() => selectCard(card.symbol)}
      >
        <span class="watch-pill-sym">{formatTerminalCompareSymbol(card.symbol)}</span>
        <span class="watch-pill-alpha" style={`color:${alphaColor(card.snapshot?.alphaScore ?? null)}`}>
          {card.snapshot?.alphaScore != null ? `${card.snapshot.alphaScore > 0 ? '+' : ''}${card.snapshot.alphaScore}` : '--'}
        </span>
        <span class="watch-pill-change" style={`color:${changeTone(card.change24h)}`}>
          {formatSigned(card.change24h ?? null, 2, '%')}
        </span>
      </button>
    {/each}
  </div>

  {#if boardMode === 'grid'}
    <div class="compare-grid dense-grid">
      {#each block.cards as card}
        {@const cardPreview = previewBySymbol.get(card.symbol) ?? null}
        {@const cardPreviewCounts = buildPreviewCounts(cardPreview)}
        {@const cardHighlights = buildChartHighlights(cardPreview, card.chartData)}
        <button
          type="button"
          class="compare-card compare-card-grid"
          class:focus-card={activeCard?.symbol === card.symbol}
          onclick={() => selectCard(card.symbol)}
        >
          <div class="compare-card-header">
            <div class="compare-card-main">
              <span class="compare-symbol">{formatTerminalCompareSymbol(card.symbol)}</span>
              <span class="compare-price">${formatPrice(card.price)}</span>
              <span class="compare-change" style={`color:${changeTone(card.change24h)}`}>
                {formatSigned(card.change24h ?? null, 2, '%')}
              </span>
            </div>
            <span class="compare-alpha" style={`color:${alphaColor(card.snapshot?.alphaScore ?? null)}`}>
              alpha {card.snapshot?.alphaScore != null ? `${card.snapshot.alphaScore > 0 ? '+' : ''}${card.snapshot.alphaScore}` : '--'}
            </span>
          </div>

          {#if cardPreview && cardPreviewCounts}
            <div class="compare-card-preview-strip">
              <span class="compare-search-pill" style={`color:${previewScopeColor(cardPreview.scopeState)}`}>
                search {cardPreviewCounts.score}
              </span>
              <span>{cardPreview.query}</span>
            </div>
          {/if}

          <div class="compare-ribbon">
            <span class="compare-chip">regime {card.snapshot?.regime ?? '--'}</span>
            <span class="compare-chip">cvd {card.snapshot?.l11?.cvd_state ?? '--'}</span>
            <span class="compare-chip">mtf {card.snapshot?.l10?.mtf_confluence ?? '--'}</span>
            <span class="compare-chip">bb {card.snapshot?.l14?.bb_squeeze ? 'SQZ' : 'OPEN'}</span>
          </div>

          <div class="compare-chart compare-chart-grid">
            {#if cardHighlights.length > 0}
              <div class="compare-highlight-layer compare-highlight-layer-compact" aria-hidden="true">
                {#each cardHighlights as highlight}
                  <span
                    class="compare-highlight-band"
                    style={`left:${highlight.left}%;width:${highlight.width}%;background:${highlight.bandColor};border-color:${highlight.lineColor};`}
                  >
                    {#if highlight.focusLeft != null}
                      <span class="compare-highlight-focus" style={`left:${highlight.focusLeft - highlight.left}%;background:${highlight.lineColor};`}></span>
                    {/if}
                  </span>
                {/each}
              </div>
            {/if}
            <CgChart
              data={card.chartData}
              currentPrice={card.price}
              annotations={card.annotations}
              indicators={card.indicators}
              symbol={card.symbol}
              timeframe={card.timeframe}
              changePct={card.change24h}
              snapshot={card.snapshot}
              derivatives={card.derivatives}
            />
          </div>

          <div class="compare-stat-grid">
            <div class="compare-stat"><span>Funding</span><strong style={`color:${fundingTone(card.derivatives?.funding ?? null)}`}>{formatFunding(card.derivatives?.funding ?? null)}</strong></div>
            <div class="compare-stat"><span>OI</span><strong>{formatOi(card.derivatives?.oi ?? null)}</strong></div>
            <div class="compare-stat"><span>L/S</span><strong>{formatLs(card.derivatives?.lsRatio ?? null)}</strong></div>
            <div class="compare-stat"><span>ATR</span><strong>{formatPercent(card.snapshot?.l15?.atr_pct ?? null)}</strong></div>
            <div class="compare-stat"><span>Fear</span><strong>{card.snapshot?.l7?.fear_greed ?? '--'}</strong></div>
            <div class="compare-stat"><span>Flow</span><strong>{card.snapshot?.l2?.detail ?? '--'}</strong></div>
          </div>
        </button>
      {/each}
    </div>
  {:else if boardMode === 'focus' && activeCard}
    {@const focusPreview = previewBySymbol.get(activeCard.symbol) ?? null}
    {@const focusPreviewCounts = buildPreviewCounts(focusPreview)}
    {@const focusHighlights = buildChartHighlights(focusPreview, activeCard.chartData)}
    <div class="focus-board">
      <section class="focus-hero">
        <div class="hero-topline">
          <div class="hero-main">
            <span class="hero-symbol">{formatTerminalCompareSymbol(activeCard.symbol)}</span>
            <span class="hero-price">${formatPrice(activeCard.price)}</span>
            <span class="hero-change" style={`color:${changeTone(activeCard.change24h)}`}>
              {formatSigned(activeCard.change24h ?? null, 2, '%')}
            </span>
          </div>
          <div class="hero-side">
            <span class="hero-alpha" style={`color:${alphaColor(activeCard.snapshot?.alphaScore ?? null)}`}>
              alpha {activeCard.snapshot?.alphaScore != null ? `${activeCard.snapshot.alphaScore > 0 ? '+' : ''}${activeCard.snapshot.alphaScore}` : '--'}
            </span>
            <span class="hero-badge">{focusBadge(activeCard)}</span>
          </div>
        </div>

        <div class="compare-ribbon hero-ribbon">
          <span class="compare-chip">regime {activeCard.snapshot?.regime ?? '--'}</span>
          <span class="compare-chip">cvd {activeCard.snapshot?.l11?.cvd_state ?? '--'}</span>
          <span class="compare-chip">mtf {activeCard.snapshot?.l10?.mtf_confluence ?? '--'}</span>
          <span class="compare-chip">breakout {activeCard.snapshot?.l13?.label ?? '--'}</span>
          <span class="compare-chip">bb {activeCard.snapshot?.l14?.bb_squeeze ? 'SQZ' : 'OPEN'}</span>
          <span class="compare-chip">atr {formatPercent(activeCard.snapshot?.l15?.atr_pct ?? null)}</span>
        </div>

        {#if focusPreview && focusPreviewCounts}
          <section class="compare-preview-card" data-scope={focusPreview.scopeState}>
            <div class="compare-preview-head">
              <div>
                <span class="compare-preview-kicker">Block Search Preview</span>
                <strong>{focusPreview.query}</strong>
              </div>
              <span class="compare-preview-score">{focusPreviewCounts.score}</span>
            </div>
            <div class="compare-preview-scope">
              <span class="compare-search-pill" style={`color:${previewScopeColor(focusPreview.scopeState)}`}>
                {focusPreview.scopeState === 'aligned' ? 'aligned' : 'scope drift'}
              </span>
              <span>{focusPreview.scopeDetail}</span>
            </div>
            <div class="compare-preview-rows">
              {#each focusPreviewCounts.compactRows as row}
                <div class="compare-preview-row">
                  <span>{row.token}</span>
                  <span style={`color:${previewStateColor(row.state)}`}>{previewStateLabel(row.state)}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <div class="compare-chart compare-chart-hero">
          {#if focusHighlights.length > 0}
            <div class="compare-highlight-layer" aria-hidden="true">
              {#each focusHighlights as highlight}
                <span
                  class="compare-highlight-band"
                  style={`left:${highlight.left}%;width:${highlight.width}%;background:${highlight.bandColor};border-color:${highlight.lineColor};`}
                >
                  <span class="compare-highlight-label" style={`color:${highlight.lineColor}`}>{highlight.label}</span>
                  {#if highlight.focusLeft != null}
                    <span class="compare-highlight-focus" style={`left:${highlight.focusLeft - highlight.left}%;background:${highlight.lineColor};`}></span>
                  {/if}
                </span>
              {/each}
            </div>
          {/if}
          <CgChart
            data={activeCard.chartData}
            currentPrice={activeCard.price}
            annotations={activeCard.annotations}
            indicators={activeCard.indicators}
            symbol={activeCard.symbol}
            timeframe={activeCard.timeframe}
            changePct={activeCard.change24h}
            snapshot={activeCard.snapshot}
            derivatives={activeCard.derivatives}
          />
        </div>

        <div class="hero-metrics">
          <div class="hero-metric"><span>Funding</span><strong style={`color:${fundingTone(activeCard.derivatives?.funding ?? null)}`}>{formatFunding(activeCard.derivatives?.funding ?? null)}</strong></div>
          <div class="hero-metric"><span>OI</span><strong>{formatOi(activeCard.derivatives?.oi ?? null)}</strong></div>
          <div class="hero-metric"><span>L/S</span><strong>{formatLs(activeCard.derivatives?.lsRatio ?? null)}</strong></div>
          <div class="hero-metric"><span>CVD</span><strong>{activeCard.snapshot?.l11?.cvd_state ?? '--'}</strong></div>
          <div class="hero-metric"><span>Fear & Greed</span><strong>{activeCard.snapshot?.l7?.fear_greed ?? '--'}</strong></div>
          <div class="hero-metric"><span>Flow</span><strong>{activeCard.snapshot?.l2?.detail ?? '--'}</strong></div>
          <div class="hero-metric"><span>Wyckoff</span><strong>{activeCard.snapshot?.l1?.phase ?? '--'}</strong></div>
          <div class="hero-metric"><span>Breakout</span><strong>{activeCard.snapshot?.l13?.label ?? '--'}</strong></div>
        </div>
      </section>

      <aside class="focus-sidepanel">
        <div class="sidepanel-title">Compare Stack</div>
        {#each block.cards as card}
          <button
            type="button"
            class="stack-card"
            class:active={activeCard.symbol === card.symbol}
            onclick={() => selectCard(card.symbol)}
          >
            <div class="stack-topline">
              <span>{formatTerminalCompareSymbol(card.symbol)}</span>
              <span style={`color:${alphaColor(card.snapshot?.alphaScore ?? null)}`}>
                {card.snapshot?.alphaScore != null ? `${card.snapshot.alphaScore > 0 ? '+' : ''}${card.snapshot.alphaScore}` : '--'}
              </span>
            </div>
            <div class="stack-midline">
              <span>${formatPrice(card.price)}</span>
              <span style={`color:${changeTone(card.change24h)}`}>{formatSigned(card.change24h ?? null, 2, '%')}</span>
              <span>{formatOi(card.derivatives?.oi ?? null)}</span>
            </div>
            <div class="stack-tags">
              <span>{card.snapshot?.regime ?? '--'}</span>
              <span>{card.snapshot?.l11?.cvd_state ?? '--'}</span>
              <span>{card.snapshot?.l14?.bb_squeeze ? 'SQZ' : 'OPEN'}</span>
            </div>
          </button>
        {/each}
      </aside>
    </div>
  {:else if boardMode === 'single' && activeCard}
    {@const singlePreview = previewBySymbol.get(activeCard.symbol) ?? null}
    {@const singlePreviewCounts = buildPreviewCounts(singlePreview)}
    {@const singleHighlights = buildChartHighlights(singlePreview, activeCard.chartData)}
    <div class="single-board">
      <section class="single-hero">
        <div class="single-header">
          <div>
            <span class="hero-symbol">{formatTerminalCompareSymbol(activeCard.symbol)}</span>
            <span class="hero-subline">{block.timeframe.toUpperCase()} focused board</span>
          </div>
          <div class="single-header-right">
            <span style={`color:${changeTone(activeCard.change24h)}`}>{formatSigned(activeCard.change24h ?? null, 2, '%')}</span>
            <span style={`color:${alphaColor(activeCard.snapshot?.alphaScore ?? null)}`}>alpha {activeCard.snapshot?.alphaScore ?? '--'}</span>
          </div>
        </div>
        {#if singlePreview && singlePreviewCounts}
          <section class="compare-preview-card compare-preview-card-compact" data-scope={singlePreview.scopeState}>
            <div class="compare-preview-head">
              <div>
                <span class="compare-preview-kicker">Block Search Preview</span>
                <strong>{singlePreview.query}</strong>
              </div>
              <span class="compare-preview-score">{singlePreviewCounts.score}</span>
            </div>
            <div class="compare-preview-scope">
              <span class="compare-search-pill" style={`color:${previewScopeColor(singlePreview.scopeState)}`}>
                {singlePreview.scopeState === 'aligned' ? 'aligned' : 'scope drift'}
              </span>
              <span>{singlePreview.scopeDetail}</span>
            </div>
          </section>
        {/if}
        <div class="compare-chart compare-chart-single">
          {#if singleHighlights.length > 0}
            <div class="compare-highlight-layer" aria-hidden="true">
              {#each singleHighlights as highlight}
                <span
                  class="compare-highlight-band"
                  style={`left:${highlight.left}%;width:${highlight.width}%;background:${highlight.bandColor};border-color:${highlight.lineColor};`}
                >
                  <span class="compare-highlight-label" style={`color:${highlight.lineColor}`}>{highlight.label}</span>
                  {#if highlight.focusLeft != null}
                    <span class="compare-highlight-focus" style={`left:${highlight.focusLeft - highlight.left}%;background:${highlight.lineColor};`}></span>
                  {/if}
                </span>
              {/each}
            </div>
          {/if}
          <CgChart
            data={activeCard.chartData}
            currentPrice={activeCard.price}
            annotations={activeCard.annotations}
            indicators={activeCard.indicators}
            symbol={activeCard.symbol}
            timeframe={activeCard.timeframe}
            changePct={activeCard.change24h}
            snapshot={activeCard.snapshot}
            derivatives={activeCard.derivatives}
          />
        </div>
      </section>

      <section class="single-ladder">
        <div class="sidepanel-title">Relative Ladder</div>
        <div class="ladder-table">
          <div class="ladder-row ladder-head">
            <span>Symbol</span>
            <span>Px</span>
            <span>24h</span>
            <span>Alpha</span>
            <span>Funding</span>
            <span>OI</span>
            <span>CVD</span>
          </div>
          {#each block.cards as card}
            <button type="button" class="ladder-row" class:active={activeCard.symbol === card.symbol} onclick={() => selectCard(card.symbol)}>
              <span>{formatTerminalCompareSymbol(card.symbol)}</span>
              <span>${formatPrice(card.price)}</span>
              <span style={`color:${changeTone(card.change24h)}`}>{formatSigned(card.change24h ?? null, 2, '%')}</span>
              <span style={`color:${alphaColor(card.snapshot?.alphaScore ?? null)}`}>{card.snapshot?.alphaScore ?? '--'}</span>
              <span style={`color:${fundingTone(card.derivatives?.funding ?? null)}`}>{formatFunding(card.derivatives?.funding ?? null)}</span>
              <span>{formatOi(card.derivatives?.oi ?? null)}</span>
              <span>{card.snapshot?.l11?.cvd_state ?? '--'}</span>
            </button>
          {/each}
        </div>
      </section>
    </div>
  {:else if boardMode === 'tv' && activeCard}
    {@const tvPreview = previewBySymbol.get(activeCard.symbol) ?? null}
    {@const tvPreviewCounts = buildPreviewCounts(tvPreview)}
    <div class="tv-board">
      <section class="tv-shell">
        <div class="tv-header">
          <div>
            <span class="hero-symbol">{formatTerminalCompareSymbol(activeCard.symbol)}</span>
            <span class="hero-subline">TradingView focus · {block.timeframe.toUpperCase()}</span>
          </div>
          <a class="tv-open-link" href={`https://www.tradingview.com/chart/?symbol=${tvSymbol(activeCard.symbol)}`} target="_blank" rel="noreferrer">
            Open TV
          </a>
        </div>
        <div class="tv-frame-wrap">
          <iframe
            title={`TradingView ${activeCard.symbol}`}
            src={tradingViewSrc(activeCard.symbol, block.timeframe)}
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
          ></iframe>
        </div>
        {#if tvPreview && tvPreviewCounts}
          <section class="compare-preview-card compare-preview-card-compact" data-scope={tvPreview.scopeState}>
            <div class="compare-preview-head">
              <div>
                <span class="compare-preview-kicker">Block Search Preview</span>
                <strong>{tvPreview.query}</strong>
              </div>
              <span class="compare-preview-score">{tvPreviewCounts.score}</span>
            </div>
            <div class="compare-preview-scope">
              <span class="compare-search-pill" style={`color:${previewScopeColor(tvPreview.scopeState)}`}>
                TV summary only
              </span>
              <span>{tvPreview.scopeDetail}</span>
            </div>
          </section>
        {/if}
      </section>

      <aside class="tv-sidepanel">
        <div class="sidepanel-title">Compare Strip</div>
        {#each block.cards as card}
          <button type="button" class="tv-mini" class:active={activeCard.symbol === card.symbol} onclick={() => selectCard(card.symbol)}>
            <div class="tv-mini-topline">
              <span>{formatTerminalCompareSymbol(card.symbol)}</span>
              <span style={`color:${alphaColor(card.snapshot?.alphaScore ?? null)}`}>{card.snapshot?.alphaScore ?? '--'}</span>
            </div>
            <div class="tv-mini-grid">
              <span>${formatPrice(card.price)}</span>
              <span style={`color:${changeTone(card.change24h)}`}>{formatSigned(card.change24h ?? null, 2, '%')}</span>
              <span style={`color:${fundingTone(card.derivatives?.funding ?? null)}`}>{formatFunding(card.derivatives?.funding ?? null)}</span>
              <span>{formatOi(card.derivatives?.oi ?? null)}</span>
            </div>
            <div class="stack-tags">
              <span>{card.snapshot?.regime ?? '--'}</span>
              <span>{card.snapshot?.l10?.mtf_confluence ?? '--'}</span>
              <span>{card.snapshot?.l11?.cvd_state ?? '--'}</span>
            </div>
          </button>
        {/each}
      </aside>
    </div>
  {/if}

  {#if block.failedSymbols.length > 0}
    <div class="compare-footnote">
      skipped {block.failedSymbols.map(formatTerminalCompareSymbol).join(', ')}
    </div>
  {/if}

  <div class="compare-footnote">
    {#if selected}
      selected compare block · follow-up commands mutate this board
    {:else}
      click a symbol card to target this compare board for follow-up commands
    {/if}
  </div>
</section>

<style>
  .compare-block {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    border: 1px solid transparent;
    border-radius: 18px;
    background:
      radial-gradient(circle at top right, rgba(54, 215, 255, 0.05), transparent 28%),
      linear-gradient(180deg, rgba(7, 11, 18, 0.9), rgba(4, 8, 14, 0.82));
    transition: border-color 120ms ease, background 120ms ease;
    cursor: pointer;
  }

  .compare-block:hover,
  .compare-block:focus-visible {
    border-color: rgba(176, 205, 228, 0.22);
    outline: none;
  }

  .compare-block.selected {
    border-color: rgba(219, 154, 159, 0.38);
    background:
      radial-gradient(circle at top right, rgba(219, 154, 159, 0.08), transparent 24%),
      linear-gradient(180deg, rgba(9, 12, 18, 0.94), rgba(4, 8, 14, 0.88));
  }

  .compare-header {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .compare-heading {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .compare-kicker,
  .hero-subline,
  .sidepanel-title {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(176, 205, 228, 0.62);
  }

  .compare-heading strong,
  .hero-symbol {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 28px;
    line-height: 1;
    letter-spacing: 0.04em;
    color: var(--sc-text-0, #f7f2ea);
  }

  .compare-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: rgba(247, 242, 234, 0.56);
  }

  .compare-search-pill {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid currentColor;
    background: rgba(255, 255, 255, 0.04);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .compare-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .compare-mode-switch {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }

  .compare-mode-switch button,
  .watch-pill,
  .stack-card,
  .ladder-row,
  .tv-mini {
    border: 0;
    background: transparent;
    color: inherit;
  }

  .compare-mode-switch button {
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(247, 242, 234, 0.56);
    cursor: pointer;
  }

  .compare-mode-switch button.active {
    background: rgba(176, 205, 228, 0.14);
    color: rgba(247, 242, 234, 0.92);
  }

  .compare-tag-row,
  .compare-ribbon,
  .stack-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .compare-timeframe,
  .compare-chip,
  .hero-badge {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid rgba(39, 63, 86, 0.78);
    background: rgba(7, 16, 28, 0.78);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(176, 205, 228, 0.74);
  }

  .compare-watchstrip {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .watch-pill {
    display: inline-grid;
    grid-template-columns: auto auto auto;
    align-items: center;
    gap: 8px;
    min-width: max-content;
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
    cursor: pointer;
  }

  .watch-pill.active {
    border-color: rgba(219, 154, 159, 0.3);
    background: rgba(219, 154, 159, 0.08);
  }

  .watch-pill-sym {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 18px;
    letter-spacing: 0.05em;
  }

  .watch-pill-alpha,
  .watch-pill-change,
  .compare-price,
  .compare-change,
  .compare-alpha,
  .hero-price,
  .hero-change,
  .hero-alpha,
  .hero-metric strong,
  .compare-stat strong,
  .stack-topline span:last-child,
  .stack-midline,
  .ladder-row,
  .tv-mini-grid,
  .single-header-right,
  .tv-open-link {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
  }

  .compare-grid.dense-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
  }

  .compare-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding: 12px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background:
      radial-gradient(circle at top right, rgba(54, 215, 255, 0.05), transparent 28%),
      linear-gradient(180deg, rgba(7, 14, 25, 0.72), rgba(4, 10, 18, 0.5));
    cursor: pointer;
  }

  .compare-card.focus-card {
    border-color: rgba(219, 154, 159, 0.3);
    box-shadow: inset 0 0 0 1px rgba(219, 154, 159, 0.14);
  }

  .compare-card-preview-strip,
  .compare-preview-head,
  .compare-preview-row,
  .compare-preview-scope {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .compare-card-preview-strip,
  .compare-preview-card {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: rgba(247, 242, 234, 0.72);
  }

  .compare-card-preview-strip {
    min-width: 0;
  }

  .compare-preview-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid rgba(173, 202, 124, 0.16);
    background: rgba(8, 16, 28, 0.72);
  }

  .compare-preview-card[data-scope='symbol_mismatch'],
  .compare-preview-card[data-scope='timeframe_mismatch'],
  .compare-preview-card[data-scope='symbol_and_timeframe_mismatch'] {
    border-color: rgba(255, 196, 122, 0.24);
  }

  .compare-preview-card-compact {
    padding: 9px 11px;
  }

  .compare-preview-kicker,
  .compare-preview-score {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .compare-preview-kicker {
    color: rgba(176, 205, 228, 0.62);
  }

  .compare-preview-score {
    color: rgba(247, 242, 234, 0.9);
  }

  .compare-preview-head strong {
    display: block;
    margin-top: 2px;
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 13px;
    color: var(--sc-text-0, #f7f2ea);
  }

  .compare-preview-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .compare-card-header,
  .hero-topline,
  .stack-topline,
  .single-header,
  .tv-header {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .compare-card-main,
  .hero-main {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .compare-symbol {
    font-family: var(--sc-font-display, 'Bebas Neue', sans-serif);
    font-size: 22px;
    color: var(--sc-text-0, #f7f2ea);
  }

  .hero-price {
    font-size: 16px;
    color: rgba(247, 242, 234, 0.92);
  }

  .compare-chart {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .compare-highlight-layer {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }

  .compare-highlight-layer-compact {
    opacity: 0.9;
  }

  .compare-highlight-band {
    position: absolute;
    top: 6px;
    bottom: 6px;
    border-left: 1px solid transparent;
    border-right: 1px solid transparent;
  }

  .compare-highlight-label {
    position: absolute;
    top: 8px;
    left: 6px;
    max-width: calc(100% - 12px);
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .compare-highlight-focus {
    position: absolute;
    top: 4px;
    bottom: 4px;
    width: 2px;
    border-radius: 999px;
    transform: translateX(-50%);
  }

  .compare-chart-grid {
    min-height: 220px;
  }

  .compare-chart-hero,
  .compare-chart-single {
    min-height: 380px;
  }

  .compare-stat-grid,
  .hero-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .hero-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .compare-stat,
  .hero-metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.025);
  }

  .compare-stat span,
  .hero-metric span,
  .stack-tags span {
    font-family: var(--sc-font-body, 'Space Grotesk', sans-serif);
    font-size: 10px;
    color: rgba(247, 242, 234, 0.5);
  }

  .focus-board,
  .single-board,
  .tv-board {
    display: grid;
    gap: 12px;
  }

  .focus-board {
    grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.75fr);
  }

  .single-board,
  .tv-board {
    grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.8fr);
  }

  .focus-hero,
  .single-hero,
  .tv-shell,
  .focus-sidepanel,
  .single-ladder,
  .tv-sidepanel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 14px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.025);
  }

  .stack-card,
  .tv-mini {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.02);
    text-align: left;
    cursor: pointer;
  }

  .stack-card.active,
  .tv-mini.active,
  .ladder-row.active {
    border-color: rgba(219, 154, 159, 0.32);
    background: rgba(219, 154, 159, 0.08);
  }

  .stack-midline,
  .tv-mini-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    font-size: 11px;
    color: rgba(247, 242, 234, 0.72);
  }

  .tv-mini-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ladder-table {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ladder-row {
    display: grid;
    grid-template-columns: 0.9fr 1fr 0.9fr 0.8fr 1fr 1fr 1fr;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.02);
    text-align: left;
    cursor: pointer;
    color: rgba(247, 242, 234, 0.84);
  }

  .ladder-head {
    cursor: default;
    color: rgba(247, 242, 234, 0.5);
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
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

  .compare-footnote {
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: rgba(247, 242, 234, 0.48);
  }

  @media (max-width: 1100px) {
    .focus-board,
    .single-board,
    .tv-board {
      grid-template-columns: 1fr;
    }

    .hero-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .compare-block {
      padding: 12px;
    }

    .compare-meta {
      align-items: stretch;
      width: 100%;
    }

    .compare-mode-switch {
      width: 100%;
      justify-content: space-between;
      overflow-x: auto;
    }

    .compare-grid.dense-grid,
    .compare-stat-grid,
    .hero-metrics {
      grid-template-columns: 1fr;
    }

    .compare-chart-grid {
      min-height: 180px;
    }

    .compare-chart-hero,
    .compare-chart-single {
      min-height: 240px;
    }

    .tv-frame-wrap,
    .tv-frame-wrap iframe {
      min-height: 360px;
    }

    .ladder-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
