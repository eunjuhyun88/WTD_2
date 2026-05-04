import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { chartSaveModeV2 } from '../chartSaveMode.store';

function reset() {
  chartSaveModeV2.cancel();
}

describe('chartSaveModeV2', () => {
  beforeEach(reset);

  it('starts in idle with no range', () => {
    const s = get(chartSaveModeV2);
    expect(s.mode).toBe('idle');
    expect(s.range).toBeNull();
  });

  it('enterRangeMode transitions to awaiting-drag and clears range', () => {
    chartSaveModeV2.enterRangeMode();
    const s = get(chartSaveModeV2);
    expect(s.mode).toBe('awaiting-drag');
    expect(s.range).toBeNull();
  });

  it('setRange transitions to preview with correct range data', () => {
    chartSaveModeV2.enterRangeMode();
    chartSaveModeV2.setRange({
      from: 1_000_000,
      to:   1_003_600,
      symbol: 'BTCUSDT',
      tf: '5m',
    });
    const s = get(chartSaveModeV2);
    expect(s.mode).toBe('preview');
    expect(s.range).toEqual({
      from: 1_000_000,
      to:   1_003_600,
      symbol: 'BTCUSDT',
      tf: '5m',
    });
  });

  it('setRange ignores zero-width drag (from === to)', () => {
    chartSaveModeV2.enterRangeMode();
    chartSaveModeV2.setRange({
      from: 1_000_000,
      to:   1_000_000,
      symbol: 'BTCUSDT',
      tf: '5m',
    });
    const s = get(chartSaveModeV2);
    expect(s.mode).toBe('awaiting-drag');
    expect(s.range).toBeNull();
  });

  it('commitSave returns the range and resets to idle', () => {
    chartSaveModeV2.enterRangeMode();
    chartSaveModeV2.setRange({ from: 100, to: 200, symbol: 'ETHUSDT', tf: '1h' });

    const returned = chartSaveModeV2.commitSave();
    expect(returned).toEqual({ from: 100, to: 200, symbol: 'ETHUSDT', tf: '1h' });

    const s = get(chartSaveModeV2);
    expect(s.mode).toBe('idle');
    expect(s.range).toBeNull();
  });

  it('commitFindPattern returns the range and resets to idle', () => {
    chartSaveModeV2.enterRangeMode();
    chartSaveModeV2.setRange({ from: 300, to: 400, symbol: 'SOLUSDT', tf: '15m' });

    const returned = chartSaveModeV2.commitFindPattern();
    expect(returned).toEqual({ from: 300, to: 400, symbol: 'SOLUSDT', tf: '15m' });

    const s = get(chartSaveModeV2);
    expect(s.mode).toBe('idle');
  });

  it('commitDraft returns the range and resets to idle', () => {
    chartSaveModeV2.enterRangeMode();
    chartSaveModeV2.setRange({ from: 500, to: 600, symbol: 'BTCUSDT', tf: '4h' });

    const returned = chartSaveModeV2.commitDraft();
    expect(returned).toEqual({ from: 500, to: 600, symbol: 'BTCUSDT', tf: '4h' });

    const s = get(chartSaveModeV2);
    expect(s.mode).toBe('idle');
  });

  it('cancel from preview resets to idle', () => {
    chartSaveModeV2.enterRangeMode();
    chartSaveModeV2.setRange({ from: 1, to: 2, symbol: 'BTCUSDT', tf: '1m' });
    chartSaveModeV2.cancel();

    const s = get(chartSaveModeV2);
    expect(s.mode).toBe('idle');
    expect(s.range).toBeNull();
  });

  it('cancel from awaiting-drag resets to idle', () => {
    chartSaveModeV2.enterRangeMode();
    chartSaveModeV2.cancel();

    const s = get(chartSaveModeV2);
    expect(s.mode).toBe('idle');
  });

  it('setRange is a no-op when mode is not awaiting-drag', () => {
    // idle state → setRange ignored
    chartSaveModeV2.setRange({ from: 1, to: 2, symbol: 'BTCUSDT', tf: '1m' });
    expect(get(chartSaveModeV2).mode).toBe('idle');

    // preview state → setRange ignored (already set)
    chartSaveModeV2.enterRangeMode();
    chartSaveModeV2.setRange({ from: 1, to: 2, symbol: 'BTCUSDT', tf: '1m' });
    chartSaveModeV2.setRange({ from: 10, to: 20, symbol: 'BTCUSDT', tf: '1m' });
    expect(get(chartSaveModeV2).range?.from).toBe(1); // unchanged
  });
});
