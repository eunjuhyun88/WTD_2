import { describe, expect, it } from 'vitest';
import { buildAnalyzeCacheKey } from './cache';
import { parseAnalyzeRequest } from './requestParser';

describe('analyze request normalization', () => {
  it('defaults to BTCUSDT and 4h when params are missing', () => {
    const parsed = parseAnalyzeRequest(new URL('https://cogochi.example/api/cogochi/analyze'));

    expect(parsed).toEqual({
      symbol: 'BTCUSDT',
      tf: '4h',
    });
  });

  it('trims and normalizes symbol and timeframe inputs', () => {
    const parsed = parseAnalyzeRequest(
      new URL('https://cogochi.example/api/cogochi/analyze?symbol=%20ethusdt%20&tf=%201H%20'),
    );

    expect(parsed).toEqual({
      symbol: 'ETHUSDT',
      tf: '1h',
    });
  });

  it('falls back when params are present but blank', () => {
    const parsed = parseAnalyzeRequest(
      new URL('https://cogochi.example/api/cogochi/analyze?symbol=%20%20&tf='),
    );

    expect(parsed).toEqual({
      symbol: 'BTCUSDT',
      tf: '4h',
    });
  });
});

describe('analyze cache key normalization', () => {
  it('uses a deterministic key regardless of symbol or timeframe casing', () => {
    expect(buildAnalyzeCacheKey(' btcusdt ', ' 4H ')).toBe('BTCUSDT:4h');
    expect(buildAnalyzeCacheKey('BTCUSDT', '4h')).toBe('BTCUSDT:4h');
  });
});
