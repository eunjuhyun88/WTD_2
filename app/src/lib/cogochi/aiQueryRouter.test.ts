/**
 * aiQueryRouter — D-7 unit tests.
 */
import { describe, it, expect } from 'vitest';
import { routeQuery } from './aiQueryRouter';

describe('aiQueryRouter / routeQuery', () => {
  it('returns null for empty query', () => {
    expect(routeQuery('')).toBeNull();
    expect(routeQuery('   ')).toBeNull();
  });

  it('routes "분석해" → analyze', () => {
    const action = routeQuery('분석해');
    expect(action?.type).toBe('analyze');
  });

  it('routes "find similar pattern" → pattern-recall', () => {
    const action = routeQuery('find similar pattern');
    expect(action?.type).toBe('pattern-recall');
  });

  it('routes "비슷한 패턴 찾아줘" → pattern-recall', () => {
    const action = routeQuery('비슷한 패턴 찾아줘');
    expect(action?.type).toBe('pattern-recall');
  });

  it('routes "verdict tab" → set-tab verdict', () => {
    const action = routeQuery('verdict tab');
    expect(action).toEqual({ type: 'set-tab', tab: 'verdict' });
  });

  it('routes "research tab" → set-tab research', () => {
    const action = routeQuery('research tab');
    expect(action).toEqual({ type: 'set-tab', tab: 'research' });
  });

  it('routes "judge tab" → set-tab judge', () => {
    const action = routeQuery('judge tab');
    expect(action).toEqual({ type: 'set-tab', tab: 'judge' });
  });

  it('routes "decision tab" → set-tab decision', () => {
    const action = routeQuery('decision tab');
    expect(action).toEqual({ type: 'set-tab', tab: 'decision' });
  });

  it('routes "패턴 탭" → set-tab pattern', () => {
    const action = routeQuery('패턴 탭');
    expect(action).toEqual({ type: 'set-tab', tab: 'pattern' });
  });

  it('routes "RSI" → add-indicator rsi', () => {
    const action = routeQuery('RSI');
    expect(action).toEqual({ type: 'add-indicator', indicatorId: 'rsi' });
  });

  it('routes "MACD" → add-indicator macd', () => {
    const action = routeQuery('MACD');
    expect(action).toEqual({ type: 'add-indicator', indicatorId: 'macd' });
  });

  it('routes "OI 4h" → add-indicator oi_change_4h', () => {
    const action = routeQuery('OI 4h');
    expect(action?.type).toBe('add-indicator');
  });

  it('routes "whale" → open-whale-data', () => {
    const action = routeQuery('whale');
    expect(action?.type).toBe('open-whale-data');
  });

  it('routes "고래" → open-whale-data', () => {
    const action = routeQuery('고래');
    expect(action?.type).toBe('open-whale-data');
  });

  it('routes "drawing mode" → toggle-drawing', () => {
    const action = routeQuery('drawing mode');
    expect(action?.type).toBe('toggle-drawing');
  });

  it('routes "드로잉 모드" → toggle-drawing', () => {
    const action = routeQuery('드로잉 모드');
    expect(action?.type).toBe('toggle-drawing');
  });

  it('routes "save setup" → save-setup', () => {
    const action = routeQuery('save setup');
    expect(action?.type).toBe('save-setup');
  });

  it('falls back to analyze for long unknown queries', () => {
    const action = routeQuery('어떻게 생각해');
    expect(action?.type).toBe('analyze');
  });

  it('returns null for very short unknown query', () => {
    expect(routeQuery('hi')).toBeNull();
  });
});
