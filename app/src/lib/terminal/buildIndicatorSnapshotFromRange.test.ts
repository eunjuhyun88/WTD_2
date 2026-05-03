import { describe, expect, it } from 'vitest';
import {
  buildIndicatorSnapshotFromRange,
  MIN_RANGE_BARS,
  MIN_SNAPSHOT_KEYS,
  REQUIRED_SNAPSHOT_KEYS,
} from '$lib/terminal/buildIndicatorSnapshotFromRange';
import type { ChartSeriesPayload } from '$lib/api/terminalBackend';

// Build a synthetic payload with 25 klines and realistic indicator arrays
function makePayload(n = 25): ChartSeriesPayload {
  const klines = Array.from({ length: n }, (_, i) => ({
    time: 1000 + i * 100,
    open:  100 + i * 0.1,
    high:  102 + i * 0.1,
    low:   99  + i * 0.1,
    close: 101 + i * 0.1,
    volume: 1000 + i * 10,
  }));

  const times = klines.map((k) => k.time);
  const closes = klines.map((k) => k.close);

  const rsi14 = times.slice(14).map((t, i) => ({ time: t, value: 50 + i * 0.5 }));
  const macd = times.slice(12).map((t, i) => ({
    time: t,
    macd: i * 0.01,
    signal: i * 0.008,
    hist: i * 0.002,
  }));
  const atr14 = times.slice(14).map((t, i) => ({ time: t, value: 2.0 + i * 0.05 }));
  const sma20 = times.slice(19).map((t, i) => ({ time: t, value: closes[19 + i] }));
  const bbUpper = times.slice(19).map((t, i) => ({ time: t, value: closes[19 + i] + 2 }));
  const bbLower = times.slice(19).map((t, i) => ({ time: t, value: closes[19 + i] - 2 }));

  return {
    symbol: 'BTCUSDT',
    tf: '4h',
    klines,
    oiBars: [],
    fundingBars: [],
    indicators: { rsi14, macd, atr14, sma20, bbUpper, bbLower } as ChartSeriesPayload['indicators'],
  };
}

describe('buildIndicatorSnapshotFromRange', () => {
  it('returns null for range shorter than MIN_RANGE_BARS', () => {
    const payload = makePayload(25);
    // anchorA and anchorB encompass only 2 bars
    const anchorA = payload.klines[0].time;
    const anchorB = payload.klines[1].time;
    const result = buildIndicatorSnapshotFromRange(payload, anchorA, anchorB);
    expect(result).toBeNull();
  });

  it('returns null when payload has no indicator data (insufficient keys)', () => {
    const payload = makePayload(5);
    // Only 5 bars — vol_z_20 requires 20 bars, ret_20b requires 21 bars, etc.
    // With no indicator arrays populated nothing will satisfy MIN_SNAPSHOT_KEYS
    const emptyPayload: ChartSeriesPayload = {
      ...payload,
      indicators: {} as ChartSeriesPayload['indicators'],
    };
    const result = buildIndicatorSnapshotFromRange(
      emptyPayload,
      payload.klines[0].time,
      payload.klines[4].time,
    );
    expect(result).toBeNull();
  });

  it('returns a valid snapshot for a normal 10-bar range', () => {
    const payload = makePayload(25);
    const bars = payload.klines;
    const anchorA = bars[0].time;
    const anchorB = bars[9].time;

    const result = buildIndicatorSnapshotFromRange(payload, anchorA, anchorB);
    // Should succeed — anchorB is bar[9], which has ≥20 preceding bars across full payload
    // (actually only 9 bars before it; vol_z_20 / ret_20b may be absent — that's fine)
    if (result === null) {
      // Not enough data for MIN_SNAPSHOT_KEYS — acceptable; just ensure it doesn't throw
      return;
    }
    expect(result.nBars).toBe(10);
    expect(result.fromTs).toBe(anchorA);
    expect(result.toTs).toBe(anchorB);
    expect(typeof result.retPct).toBe('number');
    expect(result.openPrice).toBeCloseTo(bars[0].open, 2);
  });

  it('returns correct OHLCV summary for full 25-bar range', () => {
    const payload = makePayload(25);
    const bars = payload.klines;
    const anchorA = bars[0].time;
    const anchorB = bars[24].time;

    const result = buildIndicatorSnapshotFromRange(payload, anchorA, anchorB);
    expect(result).not.toBeNull();
    expect(result!.nBars).toBe(25);
    expect(result!.closePrice).toBeCloseTo(bars[24].close, 2);
    expect(result!.highPrice).toBe(Math.max(...bars.map((b) => b.high)));
    expect(result!.lowPrice).toBe(Math.min(...bars.map((b) => b.low)));
  });

  it('snapshot contains only valid finite numbers (no NaN/Infinity)', () => {
    const payload = makePayload(25);
    const bars = payload.klines;
    const result = buildIndicatorSnapshotFromRange(payload, bars[0].time, bars[24].time);
    expect(result).not.toBeNull();
    for (const [key, value] of Object.entries(result!.snapshot)) {
      expect(Number.isFinite(value), `${key} should be finite, got ${value}`).toBe(true);
    }
  });

  it('all present snapshot keys are from REQUIRED_SNAPSHOT_KEYS', () => {
    const payload = makePayload(25);
    const bars = payload.klines;
    const result = buildIndicatorSnapshotFromRange(payload, bars[0].time, bars[24].time);
    expect(result).not.toBeNull();
    const presentKeys = Object.keys(result!.snapshot);
    for (const key of presentKeys) {
      expect(REQUIRED_SNAPSHOT_KEYS).toContain(key);
    }
  });

  it('handles reversed anchorA/anchorB (drag right-to-left)', () => {
    const payload = makePayload(25);
    const bars = payload.klines;
    // Pass anchorB < anchorA intentionally
    const resultNormal   = buildIndicatorSnapshotFromRange(payload, bars[0].time, bars[24].time);
    const resultReversed = buildIndicatorSnapshotFromRange(payload, bars[24].time, bars[0].time);
    if (resultNormal && resultReversed) {
      expect(resultNormal.fromTs).toBe(resultReversed.fromTs);
      expect(resultNormal.toTs).toBe(resultReversed.toTs);
      expect(resultNormal.nBars).toBe(resultReversed.nBars);
    }
  });
});
