/**
 * streak.store.ts — shared streak_days + next threshold for StreakBadgeCard (W-0403 PR11)
 *
 * - Polls /api/profile/streak every 30s
 * - Pauses when document is hidden (visibilitychange)
 * - Singleton: safe to import from multiple components (dedup'd)
 * - Mirrors inboxBadge.store pattern.
 */

import { writable } from 'svelte/store';

export interface StreakSnapshot {
  streak_days: number;
  streak_next_threshold: number | null;
}

export const streakSnapshot = writable<StreakSnapshot>({
  streak_days: 0,
  streak_next_threshold: 1,
});

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

async function fetchStreak(): Promise<void> {
  try {
    const res = await fetch('/api/profile/streak');
    if (!res.ok) return;
    const data = (await res.json()) as Partial<StreakSnapshot>;
    if (typeof data.streak_days !== 'number') return;
    streakSnapshot.set({
      streak_days: data.streak_days,
      streak_next_threshold:
        typeof data.streak_next_threshold === 'number' ? data.streak_next_threshold : null,
    });
  } catch {
    /* non-critical — fail silently */
  }
}

function handleVisibility(): void {
  if (document.visibilityState === 'hidden') {
    if (_timer !== null) {
      clearInterval(_timer);
      _timer = null;
    }
  } else {
    fetchStreak();
    if (_timer === null) {
      _timer = setInterval(fetchStreak, 30_000);
    }
  }
}

/**
 * Start global 30s polling. Safe to call multiple times — only one interval runs.
 * Returns a cleanup function (call on component destroy or page unload).
 */
export function startStreakPolling(): () => void {
  if (_running) {
    return () => {};
  }
  _running = true;

  fetchStreak();
  _timer = setInterval(fetchStreak, 30_000);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  return () => {
    if (_timer !== null) {
      clearInterval(_timer);
      _timer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    _running = false;
  };
}

/** Expose for testing */
export { fetchStreak as _fetchStreak };
