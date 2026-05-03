// inboxCountStore — outcome_ready capture count for unverified dot badge (W-0401-P2)
// Stores the number of captures awaiting user verdict in the VerdictInbox.
// Used by AppNavRail and MobileBottomNav to show a dot when count ≥ 10.

import { writable } from 'svelte/store';

export const inboxCount = writable<number>(0);

export async function loadInboxCount(): Promise<void> {
  try {
    // limit=10: we only need to know if ≥10 pending. `count` field = rows returned.
    const res = await fetch('/api/captures/outcomes?limit=10');
    if (!res.ok) return;
    const data = await res.json() as { count?: number };
    inboxCount.set(data.count ?? 0);
  } catch { /* non-critical, fail silently */ }
}

export function startInboxCountPolling(intervalMs = 5 * 60 * 1000): () => void {
  loadInboxCount();
  const timer = setInterval(loadInboxCount, intervalMs);
  return () => clearInterval(timer);
}
