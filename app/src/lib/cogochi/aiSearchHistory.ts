/**
 * aiSearchHistory — D-9 localStorage-backed recent-query history.
 *
 * SSR-safe: persistence is a no-op in non-browser environments.
 * Bounded to MAX (50) entries, oldest evicted first. Consecutive duplicates
 * collapse to a single entry.
 */

const STORAGE_KEY = 'cogochi_ai_search_history_v1';
const MAX = 50;

let _cache: string[] | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function read(): string[] {
  if (_cache) return _cache;
  if (!isBrowser()) return (_cache = []);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return (_cache = []);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return (_cache = []);
    _cache = parsed.filter((x) => typeof x === 'string').slice(0, MAX);
    return _cache;
  } catch {
    return (_cache = []);
  }
}

function write(list: string[]): void {
  _cache = list;
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* swallow quota / privacy errors */
  }
}

export function pushQuery(query: string): void {
  const q = query.trim();
  if (!q) return;
  const list = read().slice();
  if (list[0] === q) return;
  list.unshift(q);
  write(list.slice(0, MAX));
}

export function recentQueries(n = 5): string[] {
  return read().slice(0, Math.max(0, n));
}

export function clearHistory(): void {
  write([]);
}

/** Test-only: reset the in-memory cache so localStorage is re-read. */
export function _resetCacheForTest(): void {
  _cache = null;
}
