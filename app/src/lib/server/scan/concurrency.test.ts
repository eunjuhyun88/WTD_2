import { afterEach, describe, expect, it } from 'vitest';

import {
  getScanMarketMaxParallelSymbols,
  mapWithConcurrencyLimit,
} from './concurrency';

describe('scan concurrency helpers', () => {
  afterEach(() => {
    delete process.env.SCAN_MARKET_MAX_PARALLEL_SYMBOLS;
  });

  it('uses bounded defaults for scan fan-out', () => {
    expect(getScanMarketMaxParallelSymbols()).toBe(6);

    process.env.SCAN_MARKET_MAX_PARALLEL_SYMBOLS = '0';
    expect(getScanMarketMaxParallelSymbols()).toBe(1);

    process.env.SCAN_MARKET_MAX_PARALLEL_SYMBOLS = '99';
    expect(getScanMarketMaxParallelSymbols()).toBe(32);
  });

  it('preserves order while limiting concurrency', async () => {
    let active = 0;
    let maxActive = 0;

    const settled = await mapWithConcurrencyLimit([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 10;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(settled).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 20 },
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 40 },
      { status: 'fulfilled', value: 50 },
    ]);
  });

  it('captures rejected tasks without aborting the whole batch', async () => {
    const settled = await mapWithConcurrencyLimit([1, 2, 3], 2, async (value) => {
      if (value === 2) {
        throw new Error('boom');
      }
      return value;
    });

    expect(settled[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(settled[1]?.status).toBe('rejected');
    expect((settled[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(((settled[1] as PromiseRejectedResult).reason as Error).message).toBe('boom');
    expect(settled[2]).toEqual({ status: 'fulfilled', value: 3 });
  });
});
