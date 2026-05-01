/**
 * aiSearchHistory — D-9 unit tests.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  pushQuery,
  recentQueries,
  clearHistory,
  _resetCacheForTest,
} from './aiSearchHistory';

describe('aiSearchHistory', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') window.localStorage?.clear();
    _resetCacheForTest();
  });

  it('starts empty', () => {
    expect(recentQueries()).toEqual([]);
  });

  it('push adds to front', () => {
    pushQuery('BTC 분석');
    pushQuery('ETH long');
    expect(recentQueries()).toEqual(['ETH long', 'BTC 분석']);
  });

  it('push trims whitespace and ignores empty', () => {
    pushQuery('  ');
    pushQuery('  hello  ');
    expect(recentQueries()).toEqual(['hello']);
  });

  it('push collapses consecutive duplicates', () => {
    pushQuery('BTC 분석');
    pushQuery('BTC 분석');
    expect(recentQueries()).toEqual(['BTC 분석']);
  });

  it('recent(n) limits result count', () => {
    for (let i = 0; i < 6; i++) pushQuery(`q${i}`);
    expect(recentQueries(3)).toEqual(['q5', 'q4', 'q3']);
  });

  it('caps history at 50 entries', () => {
    for (let i = 0; i < 60; i++) pushQuery(`q${i}`);
    const all = recentQueries(100);
    expect(all.length).toBe(50);
    expect(all[0]).toBe('q59');
    expect(all[49]).toBe('q10');
  });

  it('clearHistory empties storage', () => {
    pushQuery('BTC');
    pushQuery('ETH');
    clearHistory();
    expect(recentQueries()).toEqual([]);
  });

  it('persists across cache reset (localStorage)', () => {
    pushQuery('persist1');
    _resetCacheForTest();
    expect(recentQueries()).toEqual(['persist1']);
  });
});
