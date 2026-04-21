import { beforeEach, describe, expect, it } from 'vitest';
import {
  pushConfluence,
  getConfluenceHistory,
  streakBack,
  _resetConfluenceHistory,
} from './confluenceHistory';

function entry(at: number, score: number, divergence = false) {
  return { at, score, confidence: 0.5, regime: 'neutral', divergence };
}

describe('confluenceHistory', () => {
  beforeEach(() => { _resetConfluenceHistory(); });

  it('returns empty for unknown symbol', () => {
    expect(getConfluenceHistory('BTCUSDT')).toEqual([]);
  });

  it('stores and retrieves entries chronologically', () => {
    pushConfluence('BTCUSDT', entry(1000, 10));
    pushConfluence('BTCUSDT', entry(2000, 20));
    pushConfluence('BTCUSDT', entry(3000, 30));
    const h = getConfluenceHistory('BTCUSDT');
    expect(h.map(e => e.score)).toEqual([10, 20, 30]);
  });

  it('deduplicates on identical timestamp', () => {
    pushConfluence('BTCUSDT', entry(1000, 10));
    pushConfluence('BTCUSDT', entry(1000, 15)); // same at → replace
    const h = getConfluenceHistory('BTCUSDT');
    expect(h).toHaveLength(1);
    expect(h[0].score).toBe(15);
  });

  it('caps per-symbol at 288 entries', () => {
    for (let i = 0; i < 300; i++) pushConfluence('BTCUSDT', entry(i, i));
    const h = getConfluenceHistory('BTCUSDT');
    expect(h).toHaveLength(288);
    expect(h[0].score).toBe(300 - 288);      // oldest retained
    expect(h[h.length - 1].score).toBe(299); // newest
  });

  it('streakBack counts consecutive entries satisfying predicate from newest', () => {
    pushConfluence('BTCUSDT', entry(1, 10, false));
    pushConfluence('BTCUSDT', entry(2, 20, true));
    pushConfluence('BTCUSDT', entry(3, 30, true));
    pushConfluence('BTCUSDT', entry(4, 40, true));
    expect(streakBack('BTCUSDT', e => e.divergence)).toBe(3);
  });

  it('streakBack stops at first miss', () => {
    pushConfluence('BTCUSDT', entry(1, 10, true));
    pushConfluence('BTCUSDT', entry(2, 20, false)); // breaks
    pushConfluence('BTCUSDT', entry(3, 30, true));
    expect(streakBack('BTCUSDT', e => e.divergence)).toBe(1);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 100; i++) pushConfluence('BTCUSDT', entry(i, i));
    expect(getConfluenceHistory('BTCUSDT', 10)).toHaveLength(10);
    expect(getConfluenceHistory('BTCUSDT', 10).map(e => e.score)).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
  });

  it('case-insensitive symbol keys', () => {
    pushConfluence('btcusdt', entry(1, 10));
    expect(getConfluenceHistory('BTCUSDT')).toHaveLength(1);
  });
});
