import { describe, it, expect } from 'vitest';
import { routeQuery } from '../aiQueryRouter';

describe('routeQuery', () => {
  // Edge cases
  it('returns null for empty string', () => expect(routeQuery('')).toBeNull());
  it('returns null for whitespace-only', () => expect(routeQuery('   ')).toBeNull());
  it('returns null for ≤3-char no-match string', () => expect(routeQuery('hi')).toBeNull());
  it('returns analyze for >3-char no-match string', () => {
    expect(routeQuery('hello world')).toEqual({ type: 'analyze' });
  });

  // TF 변경
  it('matches Korean TF change (바꿔)', () => {
    expect(routeQuery('4h로 바꿔')).toEqual({ type: 'set-timeframe', tf: '4h' });
  });
  it('matches English TF change', () => {
    expect(routeQuery('change to 15m')).toEqual({ type: 'set-timeframe', tf: '15m' });
  });
  it('matches 1d TF', () => {
    expect(routeQuery('1d으로 변경')).toEqual({ type: 'set-timeframe', tf: '1d' });
  });

  // OI
  it('matches OI indicator (bare)', () => {
    expect(routeQuery('OI 보여줘')).toEqual({ type: 'add-indicator', indicatorId: 'oi_change_4h' });
  });
  it('matches OI with timeframe', () => {
    expect(routeQuery('OI 1h 추가')).toEqual({ type: 'add-indicator', indicatorId: 'oi_change_1h' });
  });
  it('matches open interest English', () => {
    expect(routeQuery('show open interest')).toEqual({ type: 'add-indicator', indicatorId: 'oi_change_4h' });
  });

  // RSI
  it('matches RSI', () => {
    expect(routeQuery('RSI 추가해줘')).toEqual({ type: 'add-indicator', indicatorId: 'rsi' });
  });

  // Funding rate
  it('matches funding rate (English)', () => {
    expect(routeQuery('funding rate 보여줘')).toEqual({ type: 'add-indicator', indicatorId: 'funding_rate' });
  });
  it('matches funding rate (Korean)', () => {
    expect(routeQuery('펀딩레이트 확인')).toEqual({ type: 'add-indicator', indicatorId: 'funding_rate' });
  });

  // MACD
  it('matches MACD', () => {
    expect(routeQuery('MACD 추가')).toEqual({ type: 'add-indicator', indicatorId: 'macd' });
  });

  // Pattern recall
  it('matches find similar pattern (English)', () => {
    expect(routeQuery('find similar pattern')).toEqual({ type: 'pattern-recall' });
  });
  it('matches pattern recall (Korean)', () => {
    expect(routeQuery('비슷한 패턴 찾아줘')).toEqual({ type: 'pattern-recall' });
  });

  // AI overlay — resistance
  it('matches resistance overlay', () => {
    expect(routeQuery('65000 저항')).toEqual({ type: 'ai-overlay', overlayType: 'price-line', label: 'Resistance 65000' });
  });
  it('matches resistance (English)', () => {
    expect(routeQuery('65,000 resistance')).toEqual({ type: 'ai-overlay', overlayType: 'price-line', label: 'Resistance 65,000' });
  });

  // AI overlay — support
  it('matches support overlay (Korean)', () => {
    expect(routeQuery('60000 지지')).toEqual({ type: 'ai-overlay', overlayType: 'price-line', label: 'Support 60000' });
  });
  it('matches support (English)', () => {
    expect(routeQuery('60,000 support')).toEqual({ type: 'ai-overlay', overlayType: 'price-line', label: 'Support 60,000' });
  });

  // Whale
  it('matches whale (English)', () => {
    expect(routeQuery('whale activity')).toEqual({ type: 'open-whale-data' });
  });
  it('matches whale (Korean)', () => {
    expect(routeQuery('고래 데이터')).toEqual({ type: 'open-whale-data' });
  });

  // Analyze
  it('matches 분석해', () => {
    expect(routeQuery('지금 분석해줘')).toEqual({ type: 'analyze' });
  });
  it('matches should i long', () => {
    expect(routeQuery('should i long now?')).toEqual({ type: 'analyze' });
  });

  // Tab switching
  it('matches decision tab', () => {
    expect(routeQuery('decision tab')).toEqual({ type: 'set-tab', tab: 'decision' });
  });
  it('matches verdict tab (Korean)', () => {
    expect(routeQuery('판정 탭 열어')).toEqual({ type: 'set-tab', tab: 'verdict' });
  });
  it('matches pattern tab', () => {
    expect(routeQuery('pattern tab')).toEqual({ type: 'set-tab', tab: 'pattern' });
  });
  it('matches research tab (Korean)', () => {
    expect(routeQuery('리서치 탭')).toEqual({ type: 'set-tab', tab: 'research' });
  });
  it('matches judge tab', () => {
    expect(routeQuery('judge tab')).toEqual({ type: 'set-tab', tab: 'judge' });
  });
  it('matches judge tab (Korean)', () => {
    expect(routeQuery('판단 탭')).toEqual({ type: 'set-tab', tab: 'judge' });
  });

  // Drawing mode
  it('matches drawing mode (English)', () => {
    expect(routeQuery('drawing mode')).toEqual({ type: 'toggle-drawing' });
  });
  it('matches 그리기', () => {
    expect(routeQuery('그리기 모드')).toEqual({ type: 'toggle-drawing' });
  });

  // Save setup
  it('matches save setup', () => {
    expect(routeQuery('save setup')).toEqual({ type: 'save-setup' });
  });
  it('matches 세팅 저장', () => {
    expect(routeQuery('세팅 저장해줘')).toEqual({ type: 'save-setup' });
  });
});
