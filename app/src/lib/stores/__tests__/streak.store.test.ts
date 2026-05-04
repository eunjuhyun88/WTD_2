import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { streakSnapshot, _fetchStreak } from '../streak.store';

describe('streak.store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    streakSnapshot.set({ streak_days: 0, streak_next_threshold: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at 0 days / next threshold 1', () => {
    expect(get(streakSnapshot)).toEqual({ streak_days: 0, streak_next_threshold: 1 });
  });

  it('fetchStreak sets store from response payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ streak_days: 5, streak_next_threshold: 7 }),
    } as unknown as Response);

    await _fetchStreak();
    expect(get(streakSnapshot)).toEqual({ streak_days: 5, streak_next_threshold: 7 });
  });

  it('fetchStreak accepts null streak_next_threshold (all tiers earned)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ streak_days: 42, streak_next_threshold: null }),
    } as unknown as Response);

    await _fetchStreak();
    expect(get(streakSnapshot)).toEqual({ streak_days: 42, streak_next_threshold: null });
  });

  it('fetchStreak ignores non-ok responses', async () => {
    streakSnapshot.set({ streak_days: 9, streak_next_threshold: 14 });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ streak_days: 99 }),
    } as unknown as Response);

    await _fetchStreak();
    expect(get(streakSnapshot)).toEqual({ streak_days: 9, streak_next_threshold: 14 });
  });

  it('fetchStreak ignores fetch errors silently', async () => {
    streakSnapshot.set({ streak_days: 3, streak_next_threshold: 7 });
    mockFetch.mockRejectedValueOnce(new Error('network'));

    await _fetchStreak();
    expect(get(streakSnapshot)).toEqual({ streak_days: 3, streak_next_threshold: 7 });
  });

  it('fetchStreak ignores payloads missing streak_days', async () => {
    streakSnapshot.set({ streak_days: 2, streak_next_threshold: 3 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unrelated: 1 }),
    } as unknown as Response);

    await _fetchStreak();
    expect(get(streakSnapshot)).toEqual({ streak_days: 2, streak_next_threshold: 3 });
  });
});
