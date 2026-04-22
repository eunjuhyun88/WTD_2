import { describe, expect, it } from 'vitest';
import {
  buildPatternCaptureRequestFromSelection,
  buildPatternCaptureSimilarityDraftFromSelection,
  buildSelectedRangeViewport,
} from '$lib/terminal/rangeSelectionCapture';
import type { ChartSeriesPayload } from '$lib/api/terminalBackend';

const payload: ChartSeriesPayload = {
  symbol: 'BTCUSDT',
  tf: '4h',
  klines: [
    { time: 100, open: 100, high: 102, low: 99, close: 101, volume: 10 },
    { time: 200, open: 101, high: 104, low: 100, close: 103, volume: 12 },
    { time: 300, open: 103, high: 105, low: 102, close: 104, volume: 15 },
  ],
  oiBars: [],
  fundingBars: [],
  indicators: {
    ema: [
      { time: 100, value: 100.5 },
      { time: 200, value: 101.9 },
      { time: 300, value: 103.2 },
    ],
    funding: [
      { time: 100, value: -0.01 },
      { time: 200, value: 0.02 },
      { time: 300, value: 0.03 },
    ],
    emaSourceTf: '4h',
  },
};

describe('rangeSelectionCapture', () => {
  it('builds a viewport with sliced candles and indicators', () => {
    const viewport = buildSelectedRangeViewport({
      timeframe: '4h',
      payload,
      anchorA: 100,
      anchorB: 200,
    });

    expect(viewport).not.toBeNull();
    expect(viewport?.barCount).toBe(2);
    expect(viewport?.klines.map((bar) => bar.time)).toEqual([100, 200]);
    expect((viewport?.indicators.ema as Array<{ time: number }>).map((point) => point.time)).toEqual([100, 200]);
    expect(viewport?.indicators.emaSourceTf).toBe('4h');
  });

  it('builds a capture request with phase, note, and selected viewport', () => {
    const request = buildPatternCaptureRequestFromSelection({
      symbol: 'BTCUSDT',
      timeframe: '4h',
      payload,
      anchorA: 100,
      anchorB: 300,
      note: 'OI 유지 후 저점 상승',
      phase: 'ACCUMULATION',
    });

    expect(request).not.toBeNull();
    expect(request?.reason).toBe('ACCUMULATION');
    expect(request?.note).toBe('OI 유지 후 저점 상승');
    expect(request?.snapshot.viewport?.barCount).toBe(3);
    expect(request?.snapshot.price).toBe(104);
  });

  it('returns null when the selected range has no candles', () => {
    const request = buildPatternCaptureRequestFromSelection({
      symbol: 'BTCUSDT',
      timeframe: '4h',
      payload,
      anchorA: 999,
      anchorB: 1000,
    });

    const draft = buildPatternCaptureSimilarityDraftFromSelection({
      symbol: 'BTCUSDT',
      timeframe: '4h',
      payload,
      anchorA: 999,
      anchorB: 1000,
    });

    expect(request).toBeNull();
    expect(draft).toBeNull();
  });
});
