import type { IChartApi } from 'lightweight-charts';
import type { DrawingMode } from '$lib/chart/chartTypes';

interface LogicalRangeLike {
  from: number;
}

type ChartHotkeyAction =
  | { type: 'drawing'; mode: DrawingMode }
  | { type: 'zoom'; direction: 1 | -1 }
  | { type: 'reset-scale' }
  | { type: 'fit-range' }
  | { type: 'toggle-drawings' };

export interface ChartRuntimeBindingOptions {
  chart: IChartApi;
  chartContainer: HTMLDivElement;
  isAgentMode: () => boolean;
  isTradeLineEntryEnabled: () => boolean;
  onLoadMoreHistory: () => void;
  onScheduleVisiblePatternScan: () => void;
  onRenderDrawings: () => void;
  onResizeDrawingCanvas: () => void;
  onSetDrawingMode: (mode: DrawingMode) => void;
  onZoomChart: (direction: 1 | -1) => void;
  onResetChartScale: () => void;
  onFitChartRange: () => void;
  onToggleDrawingsVisible: () => void;
}

const LEFT_EDGE_HISTORY_THRESHOLD = 20;

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

export function resolveChartHotkeyAction(
  key: string,
  tradeLineEntryEnabled: boolean,
): ChartHotkeyAction | null {
  const normalized = key.toLowerCase();
  if (normalized === 'escape') return { type: 'drawing', mode: 'none' };
  if (normalized === '=' || normalized === '+') return { type: 'zoom', direction: 1 };
  if (normalized === '-' || normalized === '_') return { type: 'zoom', direction: -1 };
  if (normalized === '0') return { type: 'reset-scale' };
  if (normalized === 'f') return { type: 'fit-range' };
  if (normalized === 'v') return { type: 'toggle-drawings' };
  if (normalized === 'h') return { type: 'drawing', mode: 'hline' };
  if (normalized === 't') return { type: 'drawing', mode: 'trendline' };
  if (!tradeLineEntryEnabled) return null;
  if (normalized === 'r') return { type: 'drawing', mode: 'trade' };
  if (normalized === 'l') return { type: 'drawing', mode: 'longentry' };
  if (normalized === 's') return { type: 'drawing', mode: 'shortentry' };
  return null;
}

export function bindChartRuntimeInteractions(
  options: ChartRuntimeBindingOptions,
): () => void {
  const onVisibleLogicalRangeChange = (range: LogicalRangeLike | null) => {
    if (
      range &&
      range.from < LEFT_EDGE_HISTORY_THRESHOLD
    ) {
      options.onLoadMoreHistory();
    }
    options.onScheduleVisiblePatternScan();
    options.onRenderDrawings();
  };
  options.chart.timeScale().subscribeVisibleLogicalRangeChange(
    onVisibleLogicalRangeChange as never,
  );

  let crosshairRAF: number | null = null;
  const onCrosshairMove = () => {
    if (crosshairRAF !== null) return;
    crosshairRAF = requestAnimationFrame(() => {
      crosshairRAF = null;
      options.onRenderDrawings();
    });
  };
  options.chart.subscribeCrosshairMove(onCrosshairMove);

  const resizeObserver = new ResizeObserver(() => {
    if (options.isAgentMode()) {
      options.chart.resize(
        options.chartContainer.clientWidth,
        options.chartContainer.clientHeight,
      );
    }
    options.onResizeDrawingCanvas();
  });
  resizeObserver.observe(options.chartContainer);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!options.isAgentMode()) return;
    if (isTextInputTarget(event.target)) return;

    const action = resolveChartHotkeyAction(
      event.key,
      options.isTradeLineEntryEnabled(),
    );
    if (!action) return;

    if (action.type === 'drawing') {
      options.onSetDrawingMode(action.mode);
      return;
    }
    if (action.type === 'zoom') {
      options.onZoomChart(action.direction);
      return;
    }
    if (action.type === 'reset-scale') {
      options.onResetChartScale();
      return;
    }
    if (action.type === 'fit-range') {
      options.onFitChartRange();
      return;
    }
    options.onToggleDrawingsVisible();
  };
  window.addEventListener('keydown', onKeyDown);

  return () => {
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    if (crosshairRAF !== null) {
      cancelAnimationFrame(crosshairRAF);
      crosshairRAF = null;
    }
    try {
      options.chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(
          onVisibleLogicalRangeChange as never,
        );
    } catch {}
    try {
      options.chart.unsubscribeCrosshairMove(onCrosshairMove);
    } catch {}
  };
}
