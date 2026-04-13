// ═══════════════════════════════════════════════════════════════
//  WTD — Home Page Static Data & Tracking Helpers
//  Extracted from +page.svelte for maintainability
// ═══════════════════════════════════════════════════════════════

// ─── GTM / Funnel Tracking ───────────────────────────────────

export type HomeFunnelStep = 'hero_view' | 'hero_feature_select' | 'hero_cta_click';
export type HomeFunnelStatus = 'view' | 'click';

interface GTMWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
}

/** Push a custom event to the GTM dataLayer */
export function gtmEvent(event: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const w = window as GTMWindow;
  if (!Array.isArray(w.dataLayer)) return;
  w.dataLayer.push({
    event,
    area: 'home',
    ...payload,
  });
}

/** Track a home page funnel step via GTM */
export function trackHomeFunnel(
  step: HomeFunnelStep,
  status: HomeFunnelStatus,
  payload: Record<string, unknown> = {}
) {
  gtmEvent('home_funnel', {
    step,
    status,
    ...payload,
  });
}

