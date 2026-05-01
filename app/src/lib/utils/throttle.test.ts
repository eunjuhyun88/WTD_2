/**
 * throttle — D-10 unit tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { throttle } from './throttle';

describe('throttle', () => {
  it('emits the first call', () => {
    const spy = vi.fn();
    const t = throttle(spy, 1000, () => 0);
    expect(t()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('suppresses subsequent calls within interval', () => {
    const spy = vi.fn();
    let now = 0;
    const t = throttle(spy, 3000, () => now);
    t();                       // emit at t=0
    now = 1500; expect(t()).toBe(false);
    now = 2999; expect(t()).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits again after interval elapses', () => {
    const spy = vi.fn();
    let now = 0;
    const t = throttle(spy, 1000, () => now);
    t();
    now = 1000; expect(t()).toBe(true);
    now = 2000; expect(t()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('cancel resets timer so next call emits', () => {
    const spy = vi.fn();
    let now = 0;
    const t = throttle(spy, 5000, () => now);
    t();
    now = 100; expect(t()).toBe(false);
    t.cancel();
    expect(t()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('passes args through to fn', () => {
    const spy = vi.fn();
    const t = throttle(spy, 1000, () => 0);
    t('hello', 42);
    expect(spy).toHaveBeenCalledWith('hello', 42);
  });

  it('lastEmittedAt reflects latest emit time', () => {
    let now = 0;
    const t = throttle(() => {}, 1000, () => now);
    expect(t.lastEmittedAt()).toBe(0);
    now = 500; t();
    expect(t.lastEmittedAt()).toBe(500);
    t.cancel();
    expect(t.lastEmittedAt()).toBe(0);
  });
});
