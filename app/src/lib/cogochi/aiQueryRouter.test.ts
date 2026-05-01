/**
 * aiQueryRouter — D-7 unit tests.
 */
import { describe, it, expect } from 'vitest';
import { routeAIQuery, extractSymbol, extractPrice, extractTimeframe } from './aiQueryRouter';

const CTX = { symbol: 'BTCUSDT', timeframe: '4h' };

describe('aiQueryRouter / routeAIQuery', () => {
  it('routes empty query to unknown', () => {
    const action = routeAIQuery('', CTX);
    expect(action.kind).toBe('unknown');
  });

  it('routes "BTC 분석" → analyze with symbol BTCUSDT', () => {
    const action = routeAIQuery('BTC 분석', CTX);
    expect(action).toEqual({ kind: 'analyze', symbol: 'BTCUSDT', timeframe: '4h' });
  });

  it('routes "ETH long 판정" → judge long ETHUSDT', () => {
    const action = routeAIQuery('ETH long 판정', CTX);
    expect(action).toEqual({
      kind: 'judge', symbol: 'ETHUSDT', timeframe: '4h', verdict: 'long',
    });
  });

  it('routes "스캔 OI 4h" → scan with timeframe 4h', () => {
    const action = routeAIQuery('스캔 OI 4h', CTX);
    expect(action.kind).toBe('scan');
    if (action.kind === 'scan') expect(action.timeframe).toBe('4h');
  });

  it('routes "find similar pattern" → recall', () => {
    const action = routeAIQuery('find similar pattern', CTX);
    expect(action.kind).toBe('recall');
  });

  it('routes "BTC 96,000 저항 표시" → overlay with price 96000', () => {
    const action = routeAIQuery('BTC 96,000 저항 표시', CTX);
    expect(action.kind).toBe('overlay');
    if (action.kind === 'overlay') {
      expect(action.price).toBe(96000);
      expect(action.label).toBe('Resistance');
      expect(action.symbol).toBe('BTCUSDT');
    }
  });

  it('routes "draw support at 3500" → overlay support 3500', () => {
    const action = routeAIQuery('draw support at 3500', CTX);
    expect(action.kind).toBe('overlay');
    if (action.kind === 'overlay') {
      expect(action.price).toBe(3500);
      expect(action.label).toBe('Support');
    }
  });

  it('routes "5분봉으로 바꿔줘" → timeframe 5m', () => {
    const action = routeAIQuery('5분봉으로 바꿔줘', CTX);
    expect(action).toEqual({ kind: 'timeframe', timeframe: '5m' });
  });

  it('routes "OI 4h" (no verb) → indicator', () => {
    const action = routeAIQuery('OI 4h', CTX);
    expect(action.kind).toBe('indicator');
  });

  it('falls back to ctx symbol when none in query', () => {
    const action = routeAIQuery('어때', CTX);
    expect(action.kind).toBe('analyze');
    if (action.kind === 'analyze') expect(action.symbol).toBe('BTCUSDT');
  });
});

describe('aiQueryRouter / extractSymbol', () => {
  it('strips prefix and appends USDT', () => {
    expect(extractSymbol('ETH long', 'BTCUSDT')).toBe('ETHUSDT');
  });
  it('keeps USDT suffix when present', () => {
    expect(extractSymbol('SOLUSDT 분석', 'BTCUSDT')).toBe('SOLUSDT');
  });
  it('returns fallback when no symbol detected', () => {
    expect(extractSymbol('show me chart', 'BTCUSDT')).toBe('BTCUSDT');
  });
});

describe('aiQueryRouter / extractPrice', () => {
  it('parses comma-separated prices', () => {
    expect(extractPrice('96,000')).toBe(96000);
  });
  it('parses decimal prices', () => {
    expect(extractPrice('3500.50')).toBe(3500.5);
  });
  it('returns null when missing', () => {
    expect(extractPrice('hello world')).toBeNull();
  });
});

describe('aiQueryRouter / extractTimeframe', () => {
  it('extracts 5m', () => { expect(extractTimeframe('5분', '4h')).toBe('5m'); });
  it('extracts 1h', () => { expect(extractTimeframe('1 hour', '4h')).toBe('1h'); });
  it('returns fallback when none', () => { expect(extractTimeframe('hello', '4h')).toBe('4h'); });
});
