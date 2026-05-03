/**
 * buildIndicatorSnapshotFromRange.test.ts — W-0392
 */

import { describe, it, expect } from 'vitest';
import { buildIndicatorSnapshotFromRange } from './buildIndicatorSnapshotFromRange';
import type { RangeSelectionBar } from './rangeSelectionCapture';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate N synthetic OHLCV bars starting at baseClose, trending up slightly. */
function makeBars(n: number, baseClose = 100, baseVolume = 1000): RangeSelectionBar[] {
  const bars: RangeSelectionBar[] = [];
  for (let i = 0; i < n; i++) {
    const close = baseClose + i * 0.1 + (Math.sin(i) * 0.5);
    const open = close - 0.05;
    const high = close + 0.2;
    const low = close - 0.2;
    const volume = baseVolume + i * 10;
    bars.push({ time: 1_700_000_000 + i * 14400, open, high, low, close, volume });
  }
  return bars;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildIndicatorSnapshotFromRange', () => {
  it('case 1: normal case with 40 bars returns all 7 keys', () => {
    const bars = makeBars(40);
    const snap = buildIndicatorSnapshotFromRange(bars);
    expect(snap).not.toBeNull();
    const keys = Object.keys(snap!);
    // All 7 required keys should be present
    expect(keys).toContain('rsi_14');
    expect(keys).toContain('vol_z_20');
    expect(keys).toContain('atr_pct_14');
    expect(keys).toContain('macd_hist');
    expect(keys).toContain('bb_width');
    expect(keys).toContain('ret_5b');
    expect(keys).toContain('ret_20b');
    // Values must be finite (no NaN/Infinity)
    for (const [, v] of Object.entries(snap!)) {
      expect(isFinite(v)).toBe(true);
    }
  });

  it('case 2: bars.length < 3 returns null', () => {
    expect(buildIndicatorSnapshotFromRange(makeBars(2))).toBeNull();
    expect(buildIndicatorSnapshotFromRange(makeBars(1))).toBeNull();
    expect(buildIndicatorSnapshotFromRange(makeBars(0))).toBeNull();
  });

  it('case 3: null / undefined payload returns null', () => {
    expect(buildIndicatorSnapshotFromRange(null)).toBeNull();
    expect(buildIndicatorSnapshotFromRange(undefined)).toBeNull();
  });

  it('case 4: look-ahead prohibition — anchorB is always last bar', () => {
    // Build bars where anchorB close is index 34 exactly.
    // ret_5b must use close[34-5]=close[29], not any later bar.
    const bars = makeBars(35);
    const snap = buildIndicatorSnapshotFromRange(bars);
    expect(snap).not.toBeNull();

    // Manually compute expected ret_5b using only bar indices we have
    const closes = bars.map((b) => b.close);
    const last = closes.length - 1; // 34
    const expected = (closes[last] - closes[last - 5]) / closes[last - 5];
    expect(snap!.ret_5b).toBeCloseTo(expected, 10);
  });

  it('case 5: constant volume → vol_z_20 omitted (stddev=0), other keys remain', () => {
    // Build bars with exactly constant volume — stddev=0 → division by zero → NaN → omit
    const bars = makeBars(40, 100, 1000);
    // Override all volumes to the same constant
    const constVolBars = bars.map((b) => ({ ...b, volume: 1000 }));
    const snap = buildIndicatorSnapshotFromRange(constVolBars);
    // With 40 bars we still get ret_5b, ret_20b, rsi_14, macd_hist, bb_width, atr_pct_14 = 6 keys
    expect(snap).not.toBeNull();
    expect(snap!.vol_z_20).toBeUndefined(); // omitted — stddev is 0
    // Should have at least 3 valid keys
    expect(Object.keys(snap!).length).toBeGreaterThanOrEqual(3);
    // All present values must be finite
    for (const [, v] of Object.entries(snap!)) {
      expect(isFinite(v)).toBe(true);
    }
  });

  it('case 6: very short bars (5 bars) — only ret_5b computable, < MIN_VALID_KEYS → null', () => {
    // 5 bars: can compute ret_5b(needs 6), so actually 0 full keys
    // ret_5b needs last >= 5, with 5 bars last=4, 4 < 5 → not computed
    // Everything else needs more bars
    const bars = makeBars(5);
    const snap = buildIndicatorSnapshotFromRange(bars);
    // With 5 bars: ret_5b needs index 5 (last=4, 4<5 → no), ret_20b no,
    // vol_z needs 21 bars, rsi needs 15, macd needs 34, bb needs 20, atr needs 15
    // All NaN → null
    expect(snap).toBeNull();
  });
});
