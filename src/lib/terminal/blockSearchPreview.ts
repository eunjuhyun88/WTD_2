import type { ParsedBlock, ParsedQuery } from '$lib/contracts';

type PreviewState = 'matched' | 'unmet' | 'unknown';

export interface BlockPreviewRow {
  key: string;
  role: ParsedBlock['role'];
  token: string;
  label: string;
  state: PreviewState;
  detail: string;
}

export interface BlockSearchPreviewModel {
  query: string;
  symbol: string | null;
  timeframe: string | null;
  direction: string | null;
  scopeState: 'aligned' | 'symbol_mismatch' | 'timeframe_mismatch' | 'symbol_and_timeframe_mismatch';
  scopeDetail: string;
  matchedCount: number;
  actionableCount: number;
  rows: BlockPreviewRow[];
  highlights: BlockPreviewHighlight[];
}

export interface BlockPreviewHighlight {
  key: string;
  label: string;
  state: PreviewState;
  startIndex: number;
  endIndex: number;
  focusIndex: number | null;
}

interface BlockPreviewEvaluation {
  row: BlockPreviewRow;
  highlight: BlockPreviewHighlight | null;
}

function normalizePct(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value > 1 ? value / 100 : value;
}

function formatSignedPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function formatMaybePct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(2)}%`;
}

function formatBars(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} bars` : '--';
}

function last<T>(arr: T[]): T | null {
  return arr.length > 0 ? arr[arr.length - 1] : null;
}

function computeMovePct(chartData: Array<{ c: number }>, lookbackBars: number | null): number | null {
  if (chartData.length < 2) return null;
  const bars = Math.max(1, Math.min(chartData.length - 1, lookbackBars ?? 24));
  const start = chartData[chartData.length - 1 - bars];
  const end = chartData[chartData.length - 1];
  if (!start || !end || !Number.isFinite(start.c) || !Number.isFinite(end.c) || start.c === 0) return null;
  return (end.c - start.c) / start.c;
}

function computeMovePctAt(chartData: Array<{ c: number }>, endIndex: number, lookbackBars: number | null): number | null {
  if (chartData.length < 2 || endIndex <= 0) return null;
  const bars = Math.max(1, Math.min(endIndex, lookbackBars ?? 24));
  const start = chartData[endIndex - bars];
  const end = chartData[endIndex];
  if (!start || !end || !Number.isFinite(start.c) || !Number.isFinite(end.c) || start.c === 0) return null;
  return (end.c - start.c) / start.c;
}

function computeWickRatio(
  chartData: Array<{ o: number; h: number; l: number; c: number }>,
  side: 'lower' | 'upper'
): number | null {
  const candle = last(chartData);
  if (!candle) return null;
  const body = Math.max(Math.abs(candle.c - candle.o), 1e-9);
  const lowerWick = Math.min(candle.o, candle.c) - candle.l;
  const upperWick = candle.h - Math.max(candle.o, candle.c);
  return side === 'lower' ? lowerWick / body : upperWick / body;
}

function computeWickRatioAt(
  chartData: Array<{ o: number; h: number; l: number; c: number }>,
  index: number,
  side: 'lower' | 'upper'
): number | null {
  const candle = chartData[index];
  if (!candle) return null;
  const body = Math.max(Math.abs(candle.c - candle.o), 1e-9);
  const lowerWick = Math.min(candle.o, candle.c) - candle.l;
  const upperWick = candle.h - Math.max(candle.o, candle.c);
  return side === 'lower' ? lowerWick / body : upperWick / body;
}

function computeVolumeRatio(chartData: Array<{ v: number }>): number | null {
  if (chartData.length < 5) return null;
  const candle = last(chartData);
  if (!candle) return null;
  const lookback = chartData.slice(-20);
  const avg = lookback.reduce((sum, row) => sum + (Number.isFinite(row.v) ? row.v : 0), 0) / lookback.length;
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return candle.v / avg;
}

function computeVolumeRatioAt(chartData: Array<{ v: number }>, index: number): number | null {
  if (index < 0 || chartData.length < 5) return null;
  const candle = chartData[index];
  if (!candle) return null;
  const lookback = chartData.slice(Math.max(0, index - 19), index + 1);
  const avg = lookback.reduce((sum, row) => sum + (Number.isFinite(row.v) ? row.v : 0), 0) / lookback.length;
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return candle.v / avg;
}

function computeMaDistance(price: number, indicators: any): number | null {
  const ema20Series: number[] = Array.isArray(indicators?.ema20)
    ? indicators.ema20.filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value))
    : [];
  const ema20 = last(ema20Series);
  if (!Number.isFinite(price) || ema20 == null || ema20 === 0) return null;
  return Math.abs((price - ema20) / ema20);
}

function computeMaDistanceAt(
  chartData: Array<{ c: number }>,
  indicators: any,
  index: number
): number | null {
  const price = chartData[index]?.c;
  const ema20 = Array.isArray(indicators?.ema20) ? indicators.ema20[index] : null;
  if (!Number.isFinite(price) || typeof ema20 !== 'number' || !Number.isFinite(ema20) || ema20 === 0) return null;
  return Math.abs((price - ema20) / ema20);
}

function computeBbWidthAt(indicators: any, index: number): number | null {
  if (!Array.isArray(indicators?.bbUpper) || !Array.isArray(indicators?.bbLower) || !Array.isArray(indicators?.bbMiddle)) {
    return null;
  }
  const upper = indicators.bbUpper[index];
  const lower = indicators.bbLower[index];
  const middle = indicators.bbMiddle[index];
  if (
    typeof upper !== 'number' ||
    typeof lower !== 'number' ||
    typeof middle !== 'number' ||
    !Number.isFinite(upper) ||
    !Number.isFinite(lower) ||
    !Number.isFinite(middle) ||
    middle === 0
  ) {
    return null;
  }
  return (upper - lower) / middle;
}

function clampIndex(index: number, chartLength: number): number {
  return Math.max(0, Math.min(chartLength - 1, index));
}

function buildHighlight(args: {
  block: ParsedBlock;
  label: string;
  state: PreviewState;
  chartLength: number;
  startIndex: number;
  endIndex: number;
  focusIndex?: number | null;
}): BlockPreviewHighlight | null {
  const { block, label, state, chartLength, startIndex, endIndex, focusIndex = null } = args;
  if (chartLength <= 0) return null;
  const safeStart = clampIndex(Math.min(startIndex, endIndex), chartLength);
  const safeEnd = clampIndex(Math.max(startIndex, endIndex), chartLength);
  return {
    key: `${block.role}-${block.function}`,
    label,
    state,
    startIndex: safeStart,
    endIndex: safeEnd,
    focusIndex: focusIndex == null ? null : clampIndex(focusIndex, chartLength),
  };
}

function blockLabel(block: ParsedBlock): string {
  return block.function.replaceAll('_', ' ');
}

function evaluateBlock(args: {
  block: ParsedBlock;
  chartData: Array<{ o: number; h: number; l: number; c: number; v: number }>;
  snapshot: any;
  indicators: any;
  price: number;
}): BlockPreviewEvaluation {
  const { block, chartData, snapshot, indicators, price } = args;

  const chartLength = chartData.length;

  switch (block.function) {
    case 'recent_rally': {
      const target = typeof block.params.pct === 'number' ? block.params.pct : null;
      const lookback = typeof block.params.lookback_bars === 'number' ? block.params.lookback_bars : null;
      const lookbackBars = Math.max(1, lookback ?? 24);
      const move = computeMovePct(chartData, lookback);
      const state: PreviewState =
        move == null || target == null ? 'unknown' : move >= target ? 'matched' : 'unmet';
      let focusIndex = chartLength - 1;
      if (target != null && chartLength > 0) {
        for (let index = chartLength - 1; index >= lookbackBars; index -= 1) {
          const candidate = computeMovePctAt(chartData, index, lookbackBars);
          if (candidate != null && candidate >= target) {
            focusIndex = index;
            break;
          }
        }
      }
      return {
        row: {
          key: block.function,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state,
          detail: move == null || target == null
            ? 'Need more chart history to score this trigger.'
            : `move ${formatSignedPct(move)} vs target ${formatMaybePct(target)} over ${formatBars(lookback)}.`,
        },
        highlight: buildHighlight({
          block,
          label: blockLabel(block),
          state,
          chartLength,
          startIndex: focusIndex - lookbackBars,
          endIndex: focusIndex,
          focusIndex,
        }),
      };
    }
    case 'recent_drop': {
      const target = typeof block.params.pct === 'number' ? block.params.pct : null;
      const lookback = typeof block.params.lookback_bars === 'number' ? block.params.lookback_bars : null;
      const lookbackBars = Math.max(1, lookback ?? 24);
      const move = computeMovePct(chartData, lookback);
      const downside = move == null ? null : -move;
      const state: PreviewState =
        downside == null || target == null ? 'unknown' : downside >= target ? 'matched' : 'unmet';
      let focusIndex = chartLength - 1;
      if (target != null && chartLength > 0) {
        for (let index = chartLength - 1; index >= lookbackBars; index -= 1) {
          const candidate = computeMovePctAt(chartData, index, lookbackBars);
          if (candidate != null && -candidate >= target) {
            focusIndex = index;
            break;
          }
        }
      }
      return {
        row: {
          key: block.function,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state,
          detail: downside == null || target == null
            ? 'Need more chart history to score this trigger.'
            : `drop ${formatMaybePct(downside)} vs target ${formatMaybePct(target)} over ${formatBars(lookback)}.`,
        },
        highlight: buildHighlight({
          block,
          label: blockLabel(block),
          state,
          chartLength,
          startIndex: focusIndex - lookbackBars,
          endIndex: focusIndex,
          focusIndex,
        }),
      };
    }
    case 'bollinger_expansion': {
      const bbWidth = normalizePct(snapshot?.l14?.bb_width);
      const expansionFactor = typeof block.params.expansion_factor === 'number' ? block.params.expansion_factor : 1.5;
      const state: PreviewState =
        bbWidth == null ? 'unknown' : bbWidth >= 0.03 * expansionFactor ? 'matched' : 'unmet';
      const gate = 0.03 * expansionFactor;
      let focusIndex = chartLength - 1;
      for (let index = chartLength - 1; index >= 0; index -= 1) {
        const candidate = computeBbWidthAt(indicators, index);
        if (candidate != null && candidate >= gate) {
          focusIndex = index;
          break;
        }
      }
      return {
        row: {
          key: block.function,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state,
          detail: bbWidth == null
            ? 'No BB width available yet.'
            : `bb width ${formatMaybePct(bbWidth)} vs expansion gate ${(gate * 100).toFixed(2)}%.`,
        },
        highlight: buildHighlight({
          block,
          label: blockLabel(block),
          state,
          chartLength,
          startIndex: focusIndex - 2,
          endIndex: focusIndex + 2,
          focusIndex,
        }),
      };
    }
    case 'bollinger_squeeze': {
      const bbWidth = normalizePct(snapshot?.l14?.bb_width);
      const threshold = typeof block.params.threshold === 'number' ? block.params.threshold : 0.02;
      const squeezeFlag = snapshot?.l14?.bb_squeeze === true;
      const state: PreviewState =
        squeezeFlag || (bbWidth != null && bbWidth <= threshold) ? 'matched' : bbWidth == null ? 'unknown' : 'unmet';
      let focusIndex = chartLength - 1;
      for (let index = chartLength - 1; index >= 0; index -= 1) {
        const candidate = computeBbWidthAt(indicators, index);
        if (candidate != null && candidate <= threshold) {
          focusIndex = index;
          break;
        }
      }
      return {
        row: {
          key: block.function,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state,
          detail: bbWidth == null
            ? 'No BB width available yet.'
            : `bb width ${formatMaybePct(bbWidth)} vs squeeze gate ${formatMaybePct(threshold)}.`,
        },
        highlight: buildHighlight({
          block,
          label: blockLabel(block),
          state,
          chartLength,
          startIndex: focusIndex - 2,
          endIndex: focusIndex + 2,
          focusIndex,
        }),
      };
    }
    case 'long_lower_wick': {
      const ratio = computeWickRatio(chartData, 'lower');
      const target = typeof block.params.body_ratio === 'number' ? block.params.body_ratio : 1.5;
      const state: PreviewState =
        ratio == null ? 'unknown' : ratio >= target ? 'matched' : 'unmet';
      let focusIndex = chartLength - 1;
      for (let index = chartLength - 1; index >= 0; index -= 1) {
        const candidate = computeWickRatioAt(chartData, index, 'lower');
        if (candidate != null && candidate >= target) {
          focusIndex = index;
          break;
        }
      }
      return {
        row: {
          key: block.function,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state,
          detail: ratio == null
            ? 'Need the latest candle to inspect wick structure.'
            : `lower wick/body ${ratio.toFixed(2)}x vs target ${target.toFixed(2)}x.`,
        },
        highlight: buildHighlight({
          block,
          label: blockLabel(block),
          state,
          chartLength,
          startIndex: focusIndex,
          endIndex: focusIndex,
          focusIndex,
        }),
      };
    }
    case 'long_upper_wick': {
      const ratio = computeWickRatio(chartData, 'upper');
      const target = typeof block.params.body_ratio === 'number' ? block.params.body_ratio : 1.5;
      const state: PreviewState =
        ratio == null ? 'unknown' : ratio >= target ? 'matched' : 'unmet';
      let focusIndex = chartLength - 1;
      for (let index = chartLength - 1; index >= 0; index -= 1) {
        const candidate = computeWickRatioAt(chartData, index, 'upper');
        if (candidate != null && candidate >= target) {
          focusIndex = index;
          break;
        }
      }
      return {
        row: {
          key: block.function,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state,
          detail: ratio == null
            ? 'Need the latest candle to inspect wick structure.'
            : `upper wick/body ${ratio.toFixed(2)}x vs target ${target.toFixed(2)}x.`,
        },
        highlight: buildHighlight({
          block,
          label: blockLabel(block),
          state,
          chartLength,
          startIndex: focusIndex,
          endIndex: focusIndex,
          focusIndex,
        }),
      };
    }
    case 'extreme_volatility': {
      const atr = normalizePct(snapshot?.l15?.atr_pct);
      const threshold = typeof block.params.atr_pct_threshold === 'number' ? block.params.atr_pct_threshold : 0.1;
      const state: PreviewState =
        atr == null ? 'unknown' : atr >= threshold ? 'matched' : 'unmet';
      return {
        row: {
          key: block.function,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state,
          detail: atr == null
            ? 'No ATR signal available yet.'
            : `atr ${formatMaybePct(atr)} vs disqualifier gate ${formatMaybePct(threshold)}.`,
        },
        highlight: buildHighlight({
          block,
          label: blockLabel(block),
          state,
          chartLength,
          startIndex: chartLength - 1,
          endIndex: chartLength - 1,
          focusIndex: chartLength - 1,
        }),
      };
    }
    case 'volume_below_average': {
      const ratio = computeVolumeRatio(chartData);
      const threshold = typeof block.params.ratio === 'number' ? block.params.ratio : 0.5;
      const state: PreviewState =
        ratio == null ? 'unknown' : ratio < threshold ? 'matched' : 'unmet';
      let focusIndex = chartLength - 1;
      for (let index = chartLength - 1; index >= 0; index -= 1) {
        const candidate = computeVolumeRatioAt(chartData, index);
        if (candidate != null && candidate < threshold) {
          focusIndex = index;
          break;
        }
      }
      return {
        row: {
          key: block.function,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state,
          detail: ratio == null
            ? 'Need recent volume history to compare against average.'
            : `latest volume ${ratio.toFixed(2)}x of avg20 vs disqualifier gate ${threshold.toFixed(2)}x.`,
        },
        highlight: buildHighlight({
          block,
          label: blockLabel(block),
          state,
          chartLength,
          startIndex: focusIndex,
          endIndex: focusIndex,
          focusIndex,
        }),
      };
    }
    case 'extended_from_ma': {
      const threshold = typeof block.params.threshold === 'number' ? block.params.threshold : 0.08;
      const distance = computeMaDistance(price, indicators);
      const state: PreviewState =
        distance == null ? 'unknown' : distance >= threshold ? 'matched' : 'unmet';
      let focusIndex = chartLength - 1;
      for (let index = chartLength - 1; index >= 0; index -= 1) {
        const candidate = computeMaDistanceAt(chartData, indicators, index);
        if (candidate != null && candidate >= threshold) {
          focusIndex = index;
          break;
        }
      }
      return {
        row: {
          key: block.function,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state,
          detail: distance == null
            ? 'No EMA20 context available yet.'
            : `distance from ema20 ${formatMaybePct(distance)} vs disqualifier gate ${formatMaybePct(threshold)}.`,
        },
        highlight: buildHighlight({
          block,
          label: blockLabel(block),
          state,
          chartLength,
          startIndex: focusIndex,
          endIndex: focusIndex,
          focusIndex,
        }),
      };
    }
    default:
      return {
        row: {
          key: `${block.role}-${block.function}`,
          role: block.role,
          token: block.source_token,
          label: blockLabel(block),
          state: 'unknown',
          detail: 'No preview evaluator for this block yet.',
        },
        highlight: null,
      };
  }
}

export function buildBlockSearchPreview(args: {
  parsedQuery: ParsedQuery | null;
  currentSymbol: string;
  currentTimeframe: string;
  chartData: Array<{ o: number; h: number; l: number; c: number; v: number }>;
  snapshot: any;
  indicators: any;
  price: number;
}): BlockSearchPreviewModel | null {
  const { parsedQuery, currentSymbol, currentTimeframe, chartData, snapshot, indicators, price } = args;
  if (!parsedQuery || parsedQuery.confidence !== 'high' || parsedQuery.blocks.length === 0) return null;

  const symbolMismatch = !!parsedQuery.symbol && !!currentSymbol && parsedQuery.symbol !== currentSymbol;
  const timeframeMismatch = !!parsedQuery.timeframe && !!currentTimeframe && parsedQuery.timeframe !== currentTimeframe;

  const scopeState = symbolMismatch && timeframeMismatch
    ? 'symbol_and_timeframe_mismatch'
    : symbolMismatch
      ? 'symbol_mismatch'
      : timeframeMismatch
        ? 'timeframe_mismatch'
        : 'aligned';

  const scopeDetail = scopeState === 'aligned'
    ? 'Preview is aligned with the active board.'
    : scopeState === 'symbol_mismatch'
      ? `Query targets ${parsedQuery.symbol?.replace('USDT', '')}, but the active board is ${currentSymbol.replace('USDT', '')}.`
      : scopeState === 'timeframe_mismatch'
        ? `Query targets ${parsedQuery.timeframe?.toUpperCase()}, but the active board is ${currentTimeframe.toUpperCase()}.`
        : `Query targets ${parsedQuery.symbol?.replace('USDT', '')} ${parsedQuery.timeframe?.toUpperCase()}, but the active board is ${currentSymbol.replace('USDT', '')} ${currentTimeframe.toUpperCase()}.`;

  const evaluations = parsedQuery.blocks.map((block) =>
    evaluateBlock({
      block,
      chartData,
      snapshot,
      indicators,
      price,
    })
  );
  const rows = evaluations.map((evaluation) => evaluation.row);
  const highlights = evaluations.flatMap((evaluation) =>
    evaluation.highlight ? [evaluation.highlight] : []
  );

  const actionableRows = rows.filter((row) => row.state !== 'unknown');
  const matchedCount = actionableRows.filter((row) => row.state === 'matched').length;

  return {
    query: parsedQuery.raw,
    symbol: parsedQuery.symbol,
    timeframe: parsedQuery.timeframe,
    direction: parsedQuery.direction,
    scopeState,
    scopeDetail,
    matchedCount,
    actionableCount: actionableRows.length,
    rows,
    highlights,
  };
}
