// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — localStorage Persistence Utilities
// Replaces repeated load/save/debounce boilerplate across 11 stores
// ═══════════════════════════════════════════════════════════════

/**
 * Safely load and parse a JSON value from localStorage.
 * Returns `fallback` if: SSR, missing key, parse error.
 */
export function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely save a JSON value to localStorage.
 * No-op during SSR.
 */
export function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled — silently ignore
  }
}

/**
 * Remove a key from localStorage.
 * No-op during SSR.
 */
export function removeFromStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * Create a debounced auto-save subscription for a Svelte writable store.
 * Returns an unsubscribe function.
 *
 * @param store     - Svelte writable store
 * @param key       - localStorage key
 * @param transform - Optional: transform store value before saving (e.g., pick specific fields)
 * @param debounceMs - Debounce delay in ms (default: 400)
 */
export function autoSave<T>(
  store: { subscribe: (fn: (value: T) => void) => () => void },
  key: string,
  transform?: (value: T) => unknown,
  debounceMs: number = 400
): () => void {
  if (typeof window === 'undefined') return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;

  const unsub = store.subscribe((value) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const toSave = transform ? transform(value) : value;
      saveToStorage(key, toSave);
    }, debounceMs);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}
