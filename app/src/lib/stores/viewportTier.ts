/**
 * viewportTier.ts
 * SSR-safe store that exposes the current responsive tier.
 * Server always returns DESKTOP. Hydrates to correct tier on mount.
 *
 * Breakpoints per W-0087:
 *   MOBILE  < 768px
 *   TABLET  768px – 1279px
 *   DESKTOP >= 1280px
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type ViewportTier = 'MOBILE' | 'TABLET' | 'DESKTOP';

export interface ViewportTierState {
  tier: ViewportTier;
  width: number;
  height: number;
}

function getTier(width: number): ViewportTier {
  if (width < 768) return 'MOBILE';
  if (width < 1280) return 'TABLET';
  return 'DESKTOP';
}

const SERVER_DEFAULT: ViewportTierState = {
  tier: 'DESKTOP',
  width: 1440,
  height: 900,
};

function createViewportTierStore() {
  const { subscribe, set } = writable<ViewportTierState>(SERVER_DEFAULT);

  if (browser) {
    function update() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      set({ tier: getTier(w), width: w, height: h });
    }

    // Initial update on creation
    update();

    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
  }

  return { subscribe };
}

export const viewportTier = createViewportTierStore();
