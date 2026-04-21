/**
 * Confluence History — in-memory ring buffer of recent Confluence scores per symbol.
 *
 * Phase 2 "flywheel lite": we don't yet persist to DB (that's a separate slice),
 * but every confluence computation pushes a timestamped score into this ring.
 * The UI can pull a 24h sparkline / divergence streak from it, and later slices
 * can replace the in-memory ring with a Supabase-backed log for correlation
 * with verdict outcomes.
 *
 * Memory budget: symbols × 288 entries × ~24 bytes ≈ 7 KB per symbol.
 * For 100 tracked symbols that's well under 1 MB total.
 *
 * Capacity is bounded per-symbol; LRU eviction of quiet symbols keeps total
 * under a hard cap.
 */

export interface ConfluenceHistoryEntry {
  /** Unix ms */
  at: number;
  score: number;
  confidence: number;
  regime: string;
  divergence: boolean;
}

const PER_SYMBOL_CAP = 288;           // 24h × 5min cadence
const MAX_SYMBOLS = 200;              // LRU cap
const store = new Map<string, { entries: ConfluenceHistoryEntry[]; lastAccess: number }>();

/** Record a new confluence reading. Deduplicates by `at` timestamp. */
export function pushConfluence(symbol: string, entry: ConfluenceHistoryEntry): void {
  const key = symbol.toUpperCase();
  let bucket = store.get(key);
  if (!bucket) {
    // LRU eviction if over cap.
    if (store.size >= MAX_SYMBOLS) {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;
      for (const [k, v] of store) {
        if (v.lastAccess < oldestAccess) {
          oldestAccess = v.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey) store.delete(oldestKey);
    }
    bucket = { entries: [], lastAccess: Date.now() };
    store.set(key, bucket);
  }
  // Dedup: if last entry has same `at`, replace instead of pushing.
  const last = bucket.entries[bucket.entries.length - 1];
  if (last && last.at === entry.at) {
    bucket.entries[bucket.entries.length - 1] = entry;
  } else {
    bucket.entries.push(entry);
    if (bucket.entries.length > PER_SYMBOL_CAP) {
      bucket.entries.shift();
    }
  }
  bucket.lastAccess = Date.now();
}

/** Retrieve recent history, newest-first. */
export function getConfluenceHistory(symbol: string, limit = 288): ConfluenceHistoryEntry[] {
  const key = symbol.toUpperCase();
  const bucket = store.get(key);
  if (!bucket) return [];
  bucket.lastAccess = Date.now();
  // Return chronological (oldest first) — easier for sparkline rendering.
  const n = Math.max(1, Math.min(limit, bucket.entries.length));
  return bucket.entries.slice(-n);
}

/**
 * Streak of consecutive entries satisfying `predicate`, counted back from now.
 * Used by the UI to show "divergence held for N readings" etc.
 */
export function streakBack(
  symbol: string,
  predicate: (e: ConfluenceHistoryEntry) => boolean
): number {
  const hist = getConfluenceHistory(symbol);
  let n = 0;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (predicate(hist[i])) n++;
    else break;
  }
  return n;
}

/** Test-only helper. */
export function _resetConfluenceHistory(): void {
  store.clear();
}
