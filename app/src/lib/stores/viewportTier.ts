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

import { readable } from 'svelte/store';
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

export const viewportTier = readable<ViewportTierState>(SERVER_DEFAULT, (set) => {
  if (!browser) return;

  function update() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    set({ tier: getTier(w), width: w, height: h });
  }

  update();

  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('orientationchange', update, { passive: true });

  return () => {
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
  };
});
