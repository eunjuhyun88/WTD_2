<script lang="ts">
  /**
   * ChartBoardHeader — extracted toolbar/header markup from ChartBoard.svelte.
   *
   * Contains:
   * - Symbol/venue tag + regime pill
   * - Chart type selector (Candles / HA / Bar / Line / Area)
   * - Price scale mode selector (Auto / Log / %)
   * - Indicators (Studies) popover
   * - Capture window summary + Save Setup action
   *
   * W-0287 Phase 4e.
   */
  import type { IChartApi } from 'lightweight-charts';
  import { PriceScaleMode } from 'lightweight-charts';

  type ChartMode = 'candle' | 'line' | 'bar' | 'area' | 'heikin';
  type PriceMode = 'normal' | 'log' | 'percent';

  type StudyId = 'ema' | 'vwap' | 'bb' | 'atr' | 'macd' | 'cvd' | 'overlay' | 'comparison';
  type StudyDefinition = {
    id: StudyId;
    label: string;
    short: string;
    category: string;
    description: string;
    active: boolean;
    featured?: boolean;
    meta?: string;
  };

  interface Props {
    /** Current chart display mode (bindable). */
    chartMode: ChartMode;
    /** Current price scale mode (bindable). */
    priceScaleMode: PriceMode;
    /** Live main chart instance for applyOptions on scale change. */
    mainChart: IChartApi | null;
    /** Regime pill data from parent. */
    quantRegime?: {
      label: string;
      tone: 'bull' | 'bear' | 'neutral' | 'warn';
    };
    /** Studies catalog — derived from chartIndicators store in parent. */
    studySections: Array<{ category: string; items: StudyDefinition[] }>;
    /** Active study count for badge display. */
    activeIndicatorCount: number;
    /** Study search query (bindable). */
    studyQuery: string;
    /** Whether EMA indicator is active (for HTF EMA picker). */
    showEMA: boolean;
    /** Available EMA TF options (only TFs higher than current chart TF). */
    emaTfOptions: string[];
    /** Selected EMA TF override (bindable). */
    emaTf: string;
    /** Capture window summary label. */
    captureWindowLabel: string;
    /** Capture bar count (null = unavailable). */
    captureBarCount: number | null;
    /** Last saved captureId — triggers "open in lab" link. */
    savedCaptureId: string | null;
    /** Called when chart mode changes. */
    onChartModeChange: (mode: ChartMode) => void;
    /** Called when price scale mode changes. */
    onPriceScaleModeChange: (mode: PriceMode) => void;
    /** Called when a study is toggled. */
    onToggleStudy: (id: StudyId) => void;
    /** Called when Save Setup button is pressed. */
    onSaveSetup: () => void;
    /** Called when EMA TF selection changes. */
    onEmaTfChange: (tf: string) => void;
    /** W-0374: Whether drawing mode is active */
    drawingMode?: boolean;
    /** W-0374: Toggle drawing mode */
    onToggleDrawingMode?: () => void;
    /** W-0374 Phase D-4: Whether IndicatorLibrary drawer is open */
    indicatorLibraryOpen?: boolean;
    /** W-0374 Phase D-4: Toggle IndicatorLibrary drawer */
    onToggleIndicatorLibrary?: () => void;
  }

  let {
    chartMode,
    priceScaleMode,
    mainChart,
    quantRegime,
    studySections,
    activeIndicatorCount,
    studyQuery,
    showEMA,
    emaTfOptions,
    emaTf,
    captureWindowLabel,
    captureBarCount,
    savedCaptureId,
    onChartModeChange,
    onPriceScaleModeChange,
    onToggleStudy,
    onSaveSetup,
    onEmaTfChange,
    drawingMode = false,
    onToggleDrawingMode,
    indicatorLibraryOpen = false,
    onToggleIndicatorLibrary,
  }: Props = $props();

  let studiesPanelOpen = $state(false);
  let studiesWrapEl = $state<HTMLDivElement | undefined>(undefined);
  let _studyQueryInternal = $state(studyQuery);

  // Close on outside click
  $effect(() => {
    if (!studiesPanelOpen || typeof document === 'undefined') return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node) || !studiesWrapEl?.contains(t)) {
        studiesPanelOpen = false;
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener('click', onDocClick, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onDocClick, true);
    };
  });
</script>

<div class="chart-header chart-header--tv">
  <div class="tv-row tv-row--top">
    <div class="chart-symbol tv-symbol-cluster chart-symbol--compact">
      <span class="sym-quote">PERP</span>
      {#if quantRegime?.label}
        <span class="sym-regime-pill" data-tone={quantRegime.tone}>{quantRegime.label}</span>
      {/if}
    </div>

    <div class="tv-actions">
      <!-- Chart type selector -->
      <div class="mode-switch" role="group" aria-label="차트 타입">
        {#each [
          { mode: 'candle', label: 'Candles' },
          { mode: 'heikin', label: 'HA' },
          { mode: 'bar', label: 'Bar' },
          { mode: 'line', label: 'Line' },
          { mode: 'area', label: 'Area' },
        ] as t (t.mode)}
          <button
            class="mode-btn"
            class:active={chartMode === t.mode}
            onclick={() => onChartModeChange(t.mode as ChartMode)}
            title={t.label}
          >{t.label}</button>
        {/each}
      </div>

      <!-- Price scale mode selector -->
      <div class="scale-btns" role="group" aria-label="가격 스케일 모드">
        {#each [
          { mode: 'normal', label: 'Auto' },
          { mode: 'log', label: 'Log' },
          { mode: 'percent', label: '%' },
        ] as s (s.mode)}
          <button
            class="mode-btn scale-btn"
            class:active={priceScaleMode === s.mode}
            onclick={() => {
              onPriceScaleModeChange(s.mode as PriceMode);
              if (mainChart) {
                mainChart.priceScale('right').applyOptions({
                  mode:
                    s.mode === 'log'
                      ? PriceScaleMode.Logarithmic
                      : s.mode === 'percent'
                        ? PriceScaleMode.Percentage
                        : PriceScaleMode.Normal,
                });
              }
            }}
          >{s.label}</button>
        {/each}
      </div>
    </div>

    <!-- Indicators (Studies) popover -->
    <div class="tv-studies-wrap" bind:this={studiesWrapEl}>
      <button
        type="button"
        class="tv-indicators-trigger"
        class:is-open={studiesPanelOpen}
        onclick={(e) => {
          e.stopPropagation();
          studiesPanelOpen = !studiesPanelOpen;
        }}
        aria-expanded={studiesPanelOpen}
        aria-controls="tv-indicators-panel"
        id="tv-indicators-trigger"
      >
        <span class="tv-indicators-glyph" aria-hidden="true">fx</span>
        Indicators
        {#if activeIndicatorCount > 0}
          <span class="tv-ind-count">{activeIndicatorCount}</span>
        {/if}
      </button>

      {#if studiesPanelOpen}
        <div
          class="tv-studies-panel"
          id="tv-indicators-panel"
          role="dialog"
          aria-labelledby="tv-indicators-trigger"
        >
          <p class="tv-panel-baseline">
            Moving averages <strong>5 / 20 / 60</strong> are always drawn.
          </p>

          <label class="tv-search-wrap" for="tv-study-search">
            <span class="tv-study-sublabel">Search studies</span>
            <input
              id="tv-study-search"
              class="tv-study-search"
              type="search"
              bind:value={_studyQueryInternal}
              placeholder="EMA, VWAP, CVD, MACD..."
            />
          </label>

          {#if studySections.length > 0}
            {#each studySections as section (section.category)}
              <section class="tv-panel-section" aria-label={section.category}>
                <h3 class="tv-panel-section-title">{section.category}</h3>
                {#each section.items as study (study.id)}
                  <button
                    type="button"
                    class="tv-study-button"
                    class:is-active={study.active}
                    onclick={() => onToggleStudy(study.id as StudyId)}
                  >
                    <span class="tv-study-main">
                      <strong>{study.label}</strong>
                      <small>{study.description}</small>
                    </span>
                    <span class="tv-study-meta">
                      {#if study.meta}
                        <em>{study.meta}</em>
                      {/if}
                      <span class="tv-study-state">{study.active ? 'On' : 'Off'}</span>
                    </span>
                  </button>
                  {#if study.id === 'ema' && showEMA && emaTfOptions.length > 0}
                    <div class="tv-study-nested">
                      <label class="tv-study-sublabel" for="tv-ema-tf">EMA resolution</label>
                      <select
                        id="tv-ema-tf"
                        class="tv-panel-select"
                        value={emaTf}
                        onchange={(e) => onEmaTfChange((e.target as HTMLSelectElement).value)}
                      >
                        <option value="">Same as chart</option>
                        {#each emaTfOptions as et (et)}
                          <option value={et}>{et}</option>
                        {/each}
                      </select>
                      <p class="tv-study-help">
                        Higher TF EMA is stepped onto chart bars to preserve the TradingView-style
                        MTF read.
                      </p>
                    </div>
                  {/if}
                {/each}
              </section>
            {/each}
          {:else}
            <div class="tv-study-empty">
              No matching studies. Try EMA, VWAP, RSI, MACD, CVD, or funding.
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Capture window summary -->
    <div class="capture-inline" aria-label="Visible capture window">
      <span class="capture-kicker">CAPTURE</span>
      <strong class="capture-label">{captureWindowLabel}</strong>
      {#if captureBarCount !== null}
        <span class="capture-meta">· {captureBarCount} bars</span>
      {/if}
    </div>

    <div class="capture-actions">
      <!-- W-0374: Drawing mode toggle -->
      {#if onToggleDrawingMode}
        <button
          class="capture-save-btn drawing-toggle"
          class:active={drawingMode}
          onclick={onToggleDrawingMode}
          title={drawingMode ? '드로잉 도구 닫기' : '드로잉 도구 열기'}
          aria-pressed={drawingMode}
        >✏</button>
      {/if}
      <!-- W-0374 Phase D-4: Indicator Library toggle -->
      <button
        class="capture-save-btn indicator-toggle"
        class:active={indicatorLibraryOpen}
        onclick={() => onToggleIndicatorLibrary?.()}
        title={indicatorLibraryOpen ? 'Hide indicators' : 'Show indicators'}
        aria-pressed={indicatorLibraryOpen}
      >📊</button>
      <button class="capture-save-btn" onclick={onSaveSetup} aria-label="Save current visible range">
        Save Setup
      </button>
      {#if savedCaptureId}
        <a
          class="capture-open-btn"
          href={`/lab?captureId=${encodeURIComponent(savedCaptureId)}&autorun=1`}
        >
          이거 찾아줘 →
        </a>
      {/if}
    </div>
  </div>
</div>

<style>
  :global(.drawing-toggle.active) {
    color: #93c5fd !important;
    border-color: rgba(59, 130, 246, 0.4) !important;
    background: rgba(59, 130, 246, 0.1) !important;
  }
</style>
