/**
 * density.store.ts — UI density toggle (W-0402 PR15)
 *
 * Persists to localStorage key `wtd:density`.
 * On change, sets `document.documentElement.dataset.density`
 * so CSS can use [data-density=compact] / [data-density=comfortable] selectors.
 *
 * Tokens defined in W-0402 PR1: --type-md, --sp-2/3 etc. respond to data-density.
 */

import { writable } from 'svelte/store';

export type Density = 'compact' | 'comfortable';

const STORAGE_KEY = 'wtd:density';
const DEFAULT: Density = 'comfortable';

function readStored(): Density {
  if (typeof localStorage === 'undefined') return DEFAULT;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'compact' || v === 'comfortable' ? v : DEFAULT;
}

function applyToDom(value: Density): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.density = value;
  }
}

function createDensityStore() {
  const initial = readStored();
  applyToDom(initial);

  const { subscribe, set, update } = writable<Density>(initial);

  return {
    subscribe,
    set(value: Density) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, value);
      }
      applyToDom(value);
      set(value);
    },
    toggle() {
      update((current) => {
        const next: Density = current === 'compact' ? 'comfortable' : 'compact';
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, next);
        }
        applyToDom(next);
        return next;
      });
    },
  };
}

export const densityStore = createDensityStore();
