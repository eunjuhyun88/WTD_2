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
      <!-- Price scale mode selector -->
      <div class="scale-btns" role="group" aria-label="Price scale mode">
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
          title={drawingMode ? 'Close drawing tools' : 'Open drawing tools'}
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
          Find this →
        </a>
      {/if}
    </div>
  </div>
</div>

<style>
  .chart-header--tv {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px;
    background: rgba(13, 17, 23, 0.97);
    border-bottom: 1px solid rgba(42, 46, 57, 0.8);
    flex-shrink: 0;
    overflow: hidden;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
  }

  .tv-row--top {
    display: contents;
  }

  .chart-symbol {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .sym-quote {
    font-size: 10px;
    font-weight: 700;
    color: rgba(177, 181, 189, 0.45);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .sym-regime-pill {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(255,255,255,0.06);
    color: rgba(177,181,189,0.7);
  }
  .sym-regime-pill[data-tone='bull'] { color: #8fdd9d; background: rgba(143,221,157,0.1); }
  .sym-regime-pill[data-tone='bear'] { color: #f19999; background: rgba(241,153,153,0.1); }
  .sym-regime-pill[data-tone='warn'] { color: #e9c167; background: rgba(233,193,103,0.1); }

  .tv-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .mode-switch,
  .scale-btns {
    display: flex;
    align-items: center;
    gap: 0;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 3px;
    overflow: hidden;
    margin-right: 4px;
  }

  .mode-btn {
    height: 20px;
    padding: 0 6px;
    background: transparent;
    border: none;
    color: rgba(177, 181, 189, 0.5);
    cursor: pointer;
    font-family: inherit;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    transition: color 0.1s, background 0.1s;
  }
  .mode-btn:hover { color: rgba(177, 181, 189, 0.85); background: rgba(255,255,255,0.04); }
  .mode-btn.active { color: rgba(220, 225, 235, 0.92); background: rgba(255,255,255,0.08); }

  .scale-btn { padding: 0 5px; font-size: 10px; }

  /* tv-studies (fx Indicators) */
  .tv-studies-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .tv-indicators-trigger {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 7px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 3px;
    color: rgba(177, 181, 189, 0.65);
    cursor: pointer;
    font-family: inherit;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    transition: color 0.1s, background 0.1s;
  }
  .tv-indicators-trigger:hover,
  .tv-indicators-trigger.is-open { color: rgba(220,225,235,0.9); background: rgba(255,255,255,0.07); }

  .tv-indicators-glyph { font-style: italic; font-size: 10px; opacity: 0.7; }

  .tv-ind-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    font-size: 9px;
    font-weight: 700;
    background: rgba(100, 200, 255, 0.2);
    color: rgba(100, 200, 255, 0.9);
    border-radius: 7px;
  }

  .tv-studies-panel {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 300;
    width: 280px;
    background: rgba(19, 23, 34, 0.98);
    border: 1px solid rgba(42, 46, 57, 0.9);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    padding: 8px 0;
    max-height: 360px;
    overflow-y: auto;
  }

  .tv-panel-baseline {
    font-size: 10px;
    color: rgba(177,181,189,0.5);
    padding: 0 12px 6px;
    margin: 0;
    border-bottom: 1px solid rgba(42,46,57,0.6);
  }

  .tv-search-wrap { display: block; padding: 6px 8px 4px; }
  .tv-study-sublabel { display: none; }
  .tv-study-search {
    width: 100%;
    height: 24px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(42,46,57,0.8);
    border-radius: 3px;
    color: rgba(220,225,235,0.9);
    font-size: 11px;
    padding: 0 8px;
    outline: none;
    box-sizing: border-box;
  }

  .tv-panel-section { padding: 4px 0; border-bottom: 1px solid rgba(42,46,57,0.4); }
  .tv-panel-section:last-child { border-bottom: none; }
  .tv-panel-section-title {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(177,181,189,0.4);
    padding: 4px 12px 2px;
    margin: 0;
  }

  .tv-study-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    gap: 8px;
  }
  .tv-study-button:hover { background: rgba(255,255,255,0.04); }
  .tv-study-button.is-active { background: rgba(100,200,255,0.06); }

  .tv-study-main { display: flex; flex-direction: column; gap: 1px; }
  .tv-study-main strong { font-size: 11px; font-weight: 600; color: rgba(220,225,235,0.85); }
  .tv-study-main small { font-size: 10px; color: rgba(177,181,189,0.5); }
  .tv-study-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .tv-study-meta em { font-size: 9px; font-style: normal; color: rgba(177,181,189,0.4); }
  .tv-study-state { font-size: 9px; color: rgba(177,181,189,0.4); }
  .tv-study-button.is-active .tv-study-state { color: rgba(100,200,255,0.8); }

  .tv-study-nested { padding: 0 12px 8px 24px; }
  .tv-study-help { font-size: 9px; color: rgba(177,181,189,0.4); margin: 4px 0 0; }
  .tv-panel-select {
    height: 22px; font-size: 10px; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(42,46,57,0.8); border-radius: 3px;
    color: rgba(220,225,235,0.8); padding: 0 4px; cursor: pointer;
  }
  .tv-study-empty { padding: 8px 12px; font-size: 10px; color: rgba(177,181,189,0.4); }

  /* Capture inline info */
  .capture-inline {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .capture-kicker {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(177,181,189,0.3);
    flex-shrink: 0;
  }

  .capture-label {
    font-size: 10px;
    color: rgba(177,181,189,0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .capture-meta {
    font-size: 10px;
    color: rgba(177,181,189,0.35);
    flex-shrink: 0;
  }

  /* Actions */
  .capture-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .capture-save-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    padding: 0 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 3px;
    color: rgba(177,181,189,0.6);
    cursor: pointer;
    font-family: inherit;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    transition: color 0.1s, background 0.1s;
  }
  .capture-save-btn:hover { color: rgba(220,225,235,0.9); background: rgba(255,255,255,0.07); }
  .capture-save-btn.active { color: #93c5fd; background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); }

  .capture-open-btn {
    height: 20px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    font-size: 10px;
    color: rgba(100,200,255,0.7);
    text-decoration: none;
    white-space: nowrap;
  }
  .capture-open-btn:hover { color: rgba(100,200,255,0.95); }

  :global(.drawing-toggle.active) {
    color: #93c5fd !important;
    border-color: rgba(59, 130, 246, 0.4) !important;
    background: rgba(59, 130, 246, 0.1) !important;
  }
</style>
