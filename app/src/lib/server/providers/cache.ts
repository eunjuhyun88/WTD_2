// ═══════════════════════════════════════════════════════════════
// Stockclaw — Bounded LRU In-Memory Cache (B-05)
// ═══════════════════════════════════════════════════════════════
// - Max entries capped to prevent unbounded memory growth
// - LRU eviction when cache is full
// - Periodic expired-entry cleanup
// - Safe for 1000+ concurrent users

import type { CacheEntry } from './types';

// ── Config ────────────────────────────────────────────────────

const MAX_ENTRIES = 500;              // Hard cap on stored items
const CLEANUP_INTERVAL_MS = 60_000;  // Prune expired entries every 60s
const EVICT_BATCH = 50;              // How many LRU items to evict when full

// ── Store ─────────────────────────────────────────────────────

interface LRUCacheEntry<T> extends CacheEntry<T> {
  lastAccess: number;  // For LRU eviction
}

const store = new Map<string, LRUCacheEntry<unknown>>();

// ── Periodic cleanup (runs once, server-side singleton) ──────

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (now > v.expiresAt) store.delete(k);
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't prevent Node from exiting
  if (_cleanupTimer && typeof _cleanupTimer === 'object' && 'unref' in _cleanupTimer) {
    (_cleanupTimer as NodeJS.Timeout).unref();
  }
}

// ── LRU eviction ─────────────────────────────────────────────

function evictLRU(): void {
  if (store.size <= MAX_ENTRIES) return;

  // First: remove all expired
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (now > v.expiresAt) store.delete(k);
  }

  // Still over limit? Evict least-recently-accessed
  if (store.size > MAX_ENTRIES) {
    const entries = [...store.entries()]
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    const toEvict = Math.min(entries.length, EVICT_BATCH);
    for (let i = 0; i < toEvict && store.size > MAX_ENTRIES - EVICT_BATCH; i++) {
      store.delete(entries[i][0]);
    }
  }
}

// ── Public API ───────────────────────────────────────────────

export function getCached<T>(key: string): T | null {
  const entry = store.get(key) as LRUCacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  // Update access time for LRU
  entry.lastAccess = Date.now();
  return entry.data;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  ensureCleanup();

  // Evict if at capacity (before inserting)
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    evictLRU();
  }

  const now = Date.now();
  store.set(key, { data, expiresAt: now + ttlMs, lastAccess: now });
}

export function invalidate(key: string): void {
  store.delete(key);
}

export function invalidatePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

export function cacheStats(): { size: number; maxSize: number; keys: string[] } {
  // Prune expired
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (now > v.expiresAt) store.delete(k);
  }
  return { size: store.size, maxSize: MAX_ENTRIES, keys: [...store.keys()] };
}
