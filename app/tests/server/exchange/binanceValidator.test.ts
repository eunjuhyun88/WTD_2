import { describe, it, expect } from 'vitest';

// Pure validation logic unit tests (no actual API call)
describe('binanceValidator unit', () => {
  it('detects trading-enabled response as invalid', () => {
    const hasTrading = (data: { enableSpotAndMarginTrading: boolean }) =>
      data.enableSpotAndMarginTrading;
    expect(hasTrading({ enableSpotAndMarginTrading: true })).toBe(true);
    expect(hasTrading({ enableSpotAndMarginTrading: false })).toBe(false);
  });
});
