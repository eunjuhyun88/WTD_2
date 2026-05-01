/**
 * aiQueryRouter — D-7 unit tests.
 */
import { describe, it, expect } from 'vitest';
import { routeAIQuery, extractSymbol, extractPrice, extractTimeframe, extractRange } from './aiQueryRouter';

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

  it('routes "BTC 95000~96000 zone" → range', () => {
    const action = routeAIQuery('BTC 95000~96000 zone', CTX);
    expect(action.kind).toBe('range');
    if (action.kind === 'range') {
      expect(action.fromPrice).toBe(95000);
      expect(action.toPrice).toBe(96000);
      expect(action.symbol).toBe('BTCUSDT');
    }
  });

  it('routes "ETH 3500-3600 저항 zone" → range with Resistance Zone label', () => {
    const action = routeAIQuery('ETH 3500-3600 저항 zone', CTX);
    expect(action.kind).toBe('range');
    if (action.kind === 'range') {
      expect(action.label).toBe('Resistance Zone');
      expect(action.symbol).toBe('ETHUSDT');
    }
  });

  it('"96000-95000" still normalizes to (min, max)', () => {
    const action = routeAIQuery('BTC 96000-95000 zone', CTX);
    expect(action.kind).toBe('range');
    if (action.kind === 'range') {
      expect(action.fromPrice).toBe(95000);
      expect(action.toPrice).toBe(96000);
    }
  });
});

describe('aiQueryRouter / extractRange', () => {
  it('parses "X~Y"', () => {
    expect(extractRange('95000~96000')).toEqual({ fromPrice: 95000, toPrice: 96000 });
  });
  it('parses "X to Y"', () => {
    expect(extractRange('3500 to 3600')).toEqual({ fromPrice: 3500, toPrice: 3600 });
  });
  it('returns null when no pair', () => {
    expect(extractRange('hello 96000')).toBeNull();
  });
  it('returns null on equal endpoints', () => {
    expect(extractRange('100~100')).toBeNull();
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
