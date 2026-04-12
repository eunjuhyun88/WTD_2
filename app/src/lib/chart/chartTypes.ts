// ═══════════════════════════════════════════════════════════════
// Stockclaw — Chart Type Definitions
// ═══════════════════════════════════════════════════════════════
// TypeScript interfaces for lightweight-charts integration.
// type-only imports are SSR-safe (erased at compile time).

import type {
  IChartApi,
  ISeriesApi,
  IPriceLine,
  Time,
} from 'lightweight-charts';
import type { BinanceKline } from '$lib/engine/types';
import type {
  ChartPatternDirection,
  ChartPatternKind,
  ChartPatternStatus,
} from '$lib/engine/patternDetector';

// ── Chart Core Context ───────────────────────────────────────

export type LWCModule = typeof import('lightweight-charts');

export interface ChartContext {
  chart: IChartApi;
  mainSeries: ISeriesApi<'Candlestick'>;
  lwcModule: LWCModule;
  klineCache: BinanceKline[];
  chartContainer: HTMLDivElement;
}

// ── Indicator Series ─────────────────────────────────────────

export interface IndicatorSeries {
  ma7: ISeriesApi<'Line'> | null;
  ma20: ISeriesApi<'Line'> | null;
  ma25: ISeriesApi<'Line'> | null;
  ma60: ISeriesApi<'Line'> | null;
  ma99: ISeriesApi<'Line'> | null;
  ma120: ISeriesApi<'Line'> | null;
  rsi: ISeriesApi<'Line'> | null;
  volume: ISeriesApi<'Histogram'> | null;
}

export type IndicatorKey = 'ma7' | 'ma20' | 'ma25' | 'ma60' | 'ma99' | 'ma120' | 'rsi' | 'vol';

// ── Position / Price Lines ───────────────────────────────────

export interface PositionLines {
  tp: IPriceLine | null;
  entry: IPriceLine | null;
  sl: IPriceLine | null;
}

// ── Drawing Tools ────────────────────────────────────────────

export type DrawingMode = 'none' | 'hline' | 'trendline' | 'longentry' | 'shortentry' | 'trade';

export type DrawingAnchorPoint = { time: number; price: number };

export type DrawingItem =
  | {
      type: 'hline';
      points: Array<{ x: number; y: number }>;
      price?: number;
      color: string;
    }
  | {
      type: 'trendline';
      points: Array<{ x: number; y: number }>;
      anchors?: [DrawingAnchorPoint, DrawingAnchorPoint];
      color: string;
    }
  | {
      type: 'tradebox';
      points: Array<{ x: number; y: number }>;
      fromTime?: number;
      toTime?: number;
      color: string;
      dir: 'LONG' | 'SHORT';
      entry: number;
      sl: number;
      tp: number;
      rr: number;
      riskPct: number;
    };

// ── Agent Trade Setup Overlay ────────────────────────────────

export interface AgentTradeSetup {
  source: 'consensus' | 'agent';
  agentName?: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  tp: number;
  sl: number;
  rr: number;
  conf: number;
  pair: string;
}

// ── Trade Plan Draft ─────────────────────────────────────────

export interface TradePlanDraft {
  pair: string;
  previewDir: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  riskPct: number;
  longRatio: number;
}

export interface PlannedTradeOrder {
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  riskPct: number;
  longRatio: number;
  shortRatio: number;
}

export interface LineEntryTradeDraft {
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
}

export interface CommunitySignalDraft {
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  tp: number;
  sl: number;
  rr: number;
  conf: number;
  source: string;
  reason: string;
}

// ── Chart Marker ─────────────────────────────────────────────

export interface ChartMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
}

export type PatternScanScope = 'visible' | 'full';

export interface PatternScanReport {
  ok: boolean;
  scope: PatternScanScope;
  candleCount: number;
  patternCount: number;
  patterns: Array<{
    kind: ChartPatternKind;
    shortName: string;
    direction: ChartPatternDirection;
    status: ChartPatternStatus;
    confidence: number;
    startTime: number;
    endTime: number;
  }>;
  message: string;
}

// ── Trade Preview ────────────────────────────────────────────

export interface TradePreviewData {
  mode: 'longentry' | 'shortentry';
  dir: 'LONG' | 'SHORT';
  left: number;
  right: number;
  entryY: number;
  slY: number;
  tpY: number;
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  riskPct: number;
}

// ── Re-export lightweight-charts types for convenience ───────

export type { IChartApi, ISeriesApi, IPriceLine, Time };
