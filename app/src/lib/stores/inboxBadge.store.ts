/**
 * inboxBadge.store.ts — shared unread inbox count for NavInboxBadge (W-0403 PR5)
 *
 * - Polls /api/captures/outcomes?limit=10 every 30s
 * - Pauses when document is hidden (visibilitychange)
 * - Singleton: safe to import from multiple components (dedup'd)
 * - count = number of rows returned (0–10), badge visible when > 0
 */

import { writable, get } from 'svelte/store';

export const inboxBadgeCount = writable<number>(0);

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

async function fetchCount(): Promise<void> {
  try {
    const res = await fetch('/api/captures/outcomes?limit=10');
    if (!res.ok) return;
    const data = (await res.json()) as { count?: number; items?: unknown[] };
    // engine returns { count, items } — use count if present, else items.length
    const n = data.count ?? (Array.isArray(data.items) ? data.items.length : 0);
    inboxBadgeCount.set(n);
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
    // resumed — fetch immediately and restart polling
    fetchCount();
    if (_timer === null) {
      _timer = setInterval(fetchCount, 30_000);
    }
  }
}

/**
 * Start global 30s polling. Safe to call multiple times — only one interval runs.
 * Returns a cleanup function (call on component destroy or page unload).
 */
export function startInboxBadgePolling(): () => void {
  if (_running) {
    // already started — return a no-op cleanup
    return () => {};
  }
  _running = true;

  fetchCount();
  _timer = setInterval(fetchCount, 30_000);

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
export { fetchCount as _fetchCount };
