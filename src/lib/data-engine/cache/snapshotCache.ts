// ─── Snapshot Cache ──────────────────────────────────────────
// 최신 단일값 캐시. (funding, ticker, OI point, …)
// 시계열이 아닌 "지금 이 순간의 값"을 저장.

import type { NormalizedSnapshot } from '../types';

// ── Config ───────────────────────────────────────────────────

const DEFAULT_TTL = 60_000;  // 1분

// ── Store ────────────────────────────────────────────────────

interface Entry {
  snapshot: NormalizedSnapshot;
  expiresAt: number;
}

const store = new Map<string, Entry>();

// ── Public API ───────────────────────────────────────────────

export function setSnapshot(
  key: string,
  snapshot: NormalizedSnapshot,
  ttlMs: number = DEFAULT_TTL,
): void {
  store.set(key, { snapshot, expiresAt: Date.now() + ttlMs });
}

export function getSnapshot(key: string): NormalizedSnapshot | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.snapshot;
}

/** 값만 빠르게 읽기 */
export function getSnapshotValue(key: string): number | null {
  return getSnapshot(key)?.value ?? null;
}

export function invalidateSnapshot(key: string): void {
  store.delete(key);
}

export function purgeExpiredSnapshots(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.expiresAt) store.delete(k);
  }
}

export function snapshotCacheStats() {
  return { size: store.size };
}
