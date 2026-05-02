/**
 * throttle — D-10 leading-edge throttle for rate-limited streams.
 *
 * Calls invoke `fn` immediately if no call has happened within the last
 * `intervalMs` ms; otherwise the call is suppressed (no trailing emit).
 * Use `cancel()` to reset the cooldown so the next call emits.
 */

export interface ThrottledFn<Args extends unknown[]> {
  (...args: Args): boolean;       // returns true if invoked, false if suppressed
  cancel(): void;
  lastEmittedAt(): number;        // 0 when never emitted (or after cancel)
}

export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  intervalMs: number,
  now: () => number = () => Date.now(),
): ThrottledFn<Args> {
  let last: number | null = null;
  function call(...args: Args): boolean {
    const t = now();
    if (last !== null && t - last < intervalMs) return false;
    last = t;
    fn(...args);
    return true;
  }
  call.cancel = () => { last = null; };
  call.lastEmittedAt = () => last ?? 0;
  return call;
}
