import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import type {
  ChartViewportSnapshot,
  PatternCaptureContextKind,
  PatternCaptureCreateRequest,
  PatternCaptureOrigin,
  PatternCaptureSimilarityDraft,
} from '$lib/contracts/terminalPersistence';
import { slicePayloadToViewport } from '$lib/terminal/chartViewportCapture';

export type RangeSelectionBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type RangeSelectionArgs = {
  timeframe: string;
  payload?: ChartSeriesPayload | null;
  anchorA: number | null;
  anchorB: number | null;
  ohlcvBars?: RangeSelectionBar[];
};

export type CaptureSelectionPhase = 'FAKE_DUMP' | 'ARCH_ZONE' | 'REAL_DUMP' | 'ACCUMULATION' | 'BREAKOUT' | 'GENERAL';

export type PatternCaptureRequestArgs = RangeSelectionArgs & {
  symbol: string;
  note?: string;
  phase?: CaptureSelectionPhase;
  contextKind?: PatternCaptureContextKind;
  triggerOrigin?: PatternCaptureOrigin;
  patternSlug?: string;
  evidenceHash?: string;
  sourceFreshness?: Record<string, string>;
  price?: number | null;
  change24h?: number | null;
  funding?: number | null;
  oiDelta?: number | null;
  freshness?: string;
};

export type PatternCaptureSimilarityDraftArgs = RangeSelectionArgs & {
  symbol: string;
  note?: string;
  phase?: CaptureSelectionPhase;
  triggerOrigin?: PatternCaptureOrigin;
  patternSlug?: string;
  excludeId?: string;
  limit?: number;
};

function inRange(time: number, from: number, to: number): boolean {
  return time >= from && time <= to;
}

function normalizeRange(anchorA: number | null, anchorB: number | null): { timeFrom: number; timeTo: number } | null {
  if (anchorA === null || anchorB === null) return null;
  const timeFrom = Math.min(anchorA, anchorB);
  const timeTo = Math.max(anchorA, anchorB);
  return { timeFrom, timeTo };
}

function fallbackViewport(args: RangeSelectionArgs, timeFrom: number, timeTo: number): ChartViewportSnapshot | null {
  const sourceBars = args.ohlcvBars ?? args.payload?.klines ?? [];
  const klines = sourceBars
    .filter((bar) => inRange(bar.time, timeFrom, timeTo))
    .map((bar) => ({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume ?? 0,
    }));

  if (klines.length === 0) return null;

  return {
    timeFrom: klines[0]?.time ?? timeFrom,
    timeTo: klines.at(-1)?.time ?? timeTo,
    tf: args.payload?.tf ?? args.timeframe,
    barCount: klines.length,
    anchorTime: timeFrom,
    klines,
    indicators: {},
  };
}

export function buildSelectedRangeViewport(args: RangeSelectionArgs): ChartViewportSnapshot | null {
  const range = normalizeRange(args.anchorA, args.anchorB);
  if (!range) return null;

  if (args.payload) {
    const viewport = slicePayloadToViewport(args.payload, range.timeFrom, range.timeTo, range.timeFrom);
    if (viewport.barCount > 0 && viewport.klines.length > 0) {
      return viewport;
    }
  }

  return fallbackViewport(args, range.timeFrom, range.timeTo);
}

export function buildPatternCaptureRequestFromSelection(
  args: PatternCaptureRequestArgs,
): PatternCaptureCreateRequest | null {
  const viewport = buildSelectedRangeViewport(args);
  if (!viewport) return null;

  return {
    symbol: args.symbol,
    timeframe: args.timeframe,
    contextKind: args.contextKind ?? 'symbol',
    triggerOrigin: args.triggerOrigin ?? 'manual',
    patternSlug: args.patternSlug,
    reason: args.phase ?? 'GENERAL',
    note: args.note?.trim() ? args.note.trim() : undefined,
    snapshot: {
      price: args.price ?? viewport.klines.at(-1)?.close ?? null,
      change24h: args.change24h ?? null,
      funding: args.funding ?? null,
      oiDelta: args.oiDelta ?? null,
      freshness: args.freshness ?? 'recent',
      viewport,
    },
    decision: {},
    evidenceHash: args.evidenceHash,
    sourceFreshness: args.sourceFreshness ?? { source: 'terminal_save_setup' },
  };
}

export function buildPatternCaptureSimilarityDraftFromSelection(
  args: PatternCaptureSimilarityDraftArgs,
): PatternCaptureSimilarityDraft | null {
  const viewport = buildSelectedRangeViewport(args);
  if (!viewport) return null;

  return {
    symbol: args.symbol,
    timeframe: args.timeframe,
    triggerOrigin: args.triggerOrigin ?? 'manual',
    patternSlug: args.patternSlug,
    reason: args.phase ?? 'GENERAL',
    note: args.note?.trim() ? args.note.trim() : undefined,
    snapshot: { viewport },
    excludeId: args.excludeId,
    limit: args.limit ?? 4,
  };
}
