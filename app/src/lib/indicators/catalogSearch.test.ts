import { describe, it, expect } from 'vitest';
import { catalogSearch } from './catalogSearch';
import { INDICATOR_REGISTRY } from './registry';

const defs = Object.values(INDICATOR_REGISTRY);

describe('catalogSearch (W-0400 Phase 1B)', () => {
  it('AC1B-2: "rsi" → top result is RSI', () => {
    const results = catalogSearch('rsi', defs);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('rsi');
  });

  it('AC1B-2: "상대강도" → top result is RSI', () => {
    const results = catalogSearch('상대강도', defs);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('rsi');
  });

  it('AC1B-2: "macd" → top result is MACD', () => {
    const results = catalogSearch('macd', defs);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('macd');
  });

  it('AC1B-2: "볼린저" → top result is BB', () => {
    const results = catalogSearch('볼린저', defs);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('bb');
  });

  it('AC1B-2: "펀딩" → returns funding_rate', () => {
    const results = catalogSearch('펀딩', defs);
    const ids = results.map(r => r.id);
    expect(ids).toContain('funding_rate');
  });

  it('empty query → returns all defs', () => {
    const results = catalogSearch('', defs);
    expect(results.length).toBe(defs.length);
  });

  it('AC1B-6: < 16ms for 5 runs on 29 entries', () => {
    const queries = ['rsi', '상대강도', 'macd', 'ema', '볼린저'];
    const start = performance.now();
    for (const q of queries) {
      catalogSearch(q, defs);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(16);
  });
});
