import { track } from '$lib/analytics';

export type CtaPosition = 'hero' | 'strip' | 'loop' | 'final';

export function trackCtaClick(position: CtaPosition, targetUrl: string): void {
  track('landing_cta_click', { position, target_url: targetUrl });
}
